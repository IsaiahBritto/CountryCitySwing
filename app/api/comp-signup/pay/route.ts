import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { calculateProcessingFee, roundCurrency } from "@/lib/utils/paymentHelpers";
import { getEventTaxCode, getProcessingFeeTaxCode } from "@/lib/utils/stripeTaxCodes";

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("host") || "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  try {
    const { compSignupId } = await req.json();
    if (!compSignupId) {
      return NextResponse.json(
        { error: "Comp signup ID is required" },
        { status: 400 }
      );
    }

    const { data: signup, error: fetchError } = await supabaseServer
      .from("comp_signups")
      .select("*")
      .eq("id", compSignupId)
      .single();

    if (fetchError || !signup) {
      return NextResponse.json(
        { error: "Comp signup not found" },
        { status: 404 }
      );
    }
    if (signup.paid) {
      return NextResponse.json(
        { error: "This comp signup has already been paid" },
        { status: 400 }
      );
    }
    if (signup.payment_method !== "Cash") {
      return NextResponse.json(
        { error: "This signup is not eligible for this payment page" },
        { status: 400 }
      );
    }

    const amountDue = Number(signup.amount_owed) || 0;
    if (amountDue <= 0) {
      await supabaseServer
        .from("comp_signups")
        .update({ paid: true, updated_at: new Date().toISOString() })
        .eq("id", compSignupId);
      return NextResponse.json({
        success: true,
        noPaymentRequired: true,
      });
    }

    const processingFee = roundCurrency(calculateProcessingFee(amountDue));
    const base = getBaseUrl(req);

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: signup.event_title + " — Comp payment",
              description: "Comp registration payment",
              tax_code: getEventTaxCode(),
            },
            unit_amount: Math.round(amountDue * 100),
          },
          quantity: 1,
        },
        ...(processingFee > 0
          ? [
              {
                price_data: {
                  currency: "usd",
                  product_data: {
                    name: "Processing Fee",
                    description: "Payment processing fee",
                    tax_code: getProcessingFeeTaxCode(),
                  },
                  unit_amount: Math.round(processingFee * 100),
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      client_reference_id: compSignupId,
      metadata: {
        payment_type: "comp_signup_cash_to_stripe",
        comp_signup_id: compSignupId,
        event_id: String(signup.event_id),
        event_title: signup.event_title,
        subtotal: String(amountDue),
        processing_fee: String(processingFee),
      },
      success_url: `${base}/events/comp-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/events/comp-pay/${compSignupId}`,
    });

    return NextResponse.json({
      success: true,
      redirect: session.url!,
    });
  } catch (error: any) {
    console.error("Comp pay error:", error);
    return NextResponse.json(
      { error: "Failed to create payment session", details: error?.message },
      { status: 500 }
    );
  }
}
