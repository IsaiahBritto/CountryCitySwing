import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { calculateProcessingFee, roundCurrency } from "@/lib/utils/paymentHelpers";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/dateHelpers";
import {
  clampPersonalMessage,
  parseDeliverAtLocal,
} from "@/lib/giftCards/schedule";

const MIN_AMOUNT = 5;
const MAX_AMOUNT = 500;

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("host") || "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function optionalProfileId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await client.auth.getUser(token);
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const paymentMethod = (body.paymentMethod ?? "stripe").toLowerCase();
    if (!["cash", "stripe"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const rawAmount = Number(body.amount);
    if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount)) {
      return NextResponse.json(
        { error: "Gift card amount must be a whole dollar amount." },
        { status: 400 }
      );
    }
    const amount = roundCurrency(rawAmount);
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return NextResponse.json(
        {
          error: `Amount must be a whole number between $${MIN_AMOUNT} and $${MAX_AMOUNT}.`,
        },
        { status: 400 }
      );
    }

    const purchasedForSelf = body.purchasedForSelf === true;
    const buyerEmail = String(body.buyerEmail ?? "").trim().toLowerCase();
    const buyerName = String(body.buyerName ?? "").trim() || null;

    if (!buyerEmail) {
      return NextResponse.json({ error: "Buyer email is required." }, { status: 400 });
    }

    let recipientEmail = purchasedForSelf
      ? buyerEmail
      : String(body.recipientEmail ?? "").trim().toLowerCase();
    const recipientName =
      String(body.recipientName ?? "").trim() ||
      (purchasedForSelf ? buyerName : null);

    if (!recipientEmail) {
      return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
    }

    const profileId = await optionalProfileId(req);
    const buyerProfileId = purchasedForSelf ? profileId : null;
    const recipientProfileId = purchasedForSelf ? profileId : null;

    const personalMessage = clampPersonalMessage(body.personalMessage);
    const timeZone = String(body.deliverTimezone ?? DEFAULT_TIME_ZONE);

    const sendNow = body.sendNow !== false && !body.scheduleDelivery;
    let deliverAt: string;
    if (sendNow) {
      deliverAt = new Date().toISOString();
    } else {
      const parsed = parseDeliverAtLocal(
        String(body.deliveryDate ?? ""),
        Number(body.deliveryHour ?? 9),
        timeZone
      );
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.message }, { status: 400 });
      }
      deliverAt = parsed.iso;
    }

    const { data: row, error: insertErr } = await supabaseServer
      .from("gift_cards")
      .insert({
        initial_amount: amount,
        balance_remaining: 0,
        status: "pending_payment",
        payment_method: paymentMethod,
        paid: false,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        buyer_profile_id: buyerProfileId,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        recipient_profile_id: recipientProfileId,
        purchased_for_self: purchasedForSelf,
        personal_message: personalMessage,
        deliver_at: deliverAt,
        deliver_timezone: timeZone,
        recipient_email_status: purchasedForSelf ? "skipped" : "pending",
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      console.error("gift card insert", insertErr);
      return NextResponse.json({ error: "Failed to create gift card" }, { status: 500 });
    }

    if (paymentMethod === "cash") {
      return NextResponse.json({
        success: true,
        giftCardId: row.id,
        pendingCash: true,
        message:
          "Your gift card request was received. It will be finalized after we confirm your cash payment.",
      });
    }

    const base = getBaseUrl(req);
    const processingFee = calculateProcessingFee(amount);
    const total = roundCurrency(amount + processingFee);

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: buyerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: "Country City Swing Gift Card",
              description: `$${amount} gift card`,
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(processingFee * 100),
            product_data: { name: "Processing fee" },
          },
        },
      ],
      metadata: {
        payment_type: "gift_card_purchase",
        gift_card_id: row.id,
        amount: String(amount),
        processing_fee: String(processingFee),
      },
      success_url: `${base}/merch/gift-cards/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/merch/gift-cards`,
    });

    await supabaseServer
      .from("gift_cards")
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    return NextResponse.json({ success: true, redirect: session.url });
  } catch (e) {
    console.error("gift card purchase", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}