import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import eventsData from "@/lib/events.json";
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
    const { signupId, promotionCodeId } = await req.json();

    if (!signupId) {
      return NextResponse.json(
        { error: "Signup ID is required" },
        { status: 400 }
      );
    }

    // Fetch signup
    const { data: signup, error: fetchError } = await supabaseServer
      .from("signups")
      .select("*")
      .eq("id", signupId)
      .single();

    if (fetchError || !signup) {
      return NextResponse.json(
        { error: "Signup not found" },
        { status: 404 }
      );
    }

    // Check if already paid
    if (signup.paid) {
      return NextResponse.json(
        { error: "This event has already been paid for" },
        { status: 400 }
      );
    }

    // Check if payment method is Cash
    if (signup.payment_method !== "Cash") {
      return NextResponse.json(
        { error: "This signup is not eligible for cash payment conversion" },
        { status: 400 }
      );
    }

    // Use stored amount_owed (after discount) when present; otherwise get event price
    const hasStoredAmountOwed = signup.amount_owed != null && Number(signup.amount_owed) >= 0;
    const amountDue = hasStoredAmountOwed ? Number(signup.amount_owed) : null;

    if (amountDue === 0) {
      return NextResponse.json(
        { error: "No payment required. Your promotion code already covered the full cost." },
        { status: 400 }
      );
    }

    let eventPrice = hasStoredAmountOwed ? amountDue! : 0;

    if (!hasStoredAmountOwed && signup.event_id) {
      try {
        const { data: eventData } = await supabaseServer
          .from("events")
          .select("price")
          .eq("id", signup.event_id)
          .single();
        if (eventData?.price) {
          eventPrice = Number(eventData.price);
        }
      } catch (e) {
        const event = (eventsData as any[]).find((e: any) => e.id === signup.event_id);
        if (event?.price) {
          eventPrice = Number(event.price);
        }
      }
    }

    if (eventPrice <= 0) {
      return NextResponse.json(
        { error: "Event price not found or event is free. Please contact support." },
        { status: 400 }
      );
    }

    // Calculate processing fee on the amount we're charging (discounted amount when applicable)
    const processingFee = roundCurrency(calculateProcessingFee(eventPrice));

    const lineItems: any[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: signup.event_title || "Event Registration",
            description: `Payment for event registration`,
            tax_code: getEventTaxCode(),
          },
          unit_amount: Math.round(eventPrice * 100),
        },
        quantity: 1,
      },
    ];

    // Add processing fee
    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
            product_data: {
              name: "Processing Fee",
              description: "Payment processing fee",
              tax_code: getProcessingFeeTaxCode(), // General - Tangible Goods (processing fees are typically tax-exempt)
            },
          unit_amount: Math.round(processingFee * 100),
        },
        quantity: 1,
      });
    }

    // Create Stripe checkout session
    const base = getBaseUrl(req);
    const sessionParams: any = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      automatic_tax: {
        enabled: true, // Enable Stripe Tax for automatic sales tax calculation
      },
      ...(promotionCodeId
        ? { discounts: [{ promotion_code: promotionCodeId }] }
        : { allow_promotion_codes: true }),
      customer_email: signup.email,
      billing_address_collection: "auto", // Optional - allows customer to fill in if needed
      client_reference_id: signupId,
      metadata: {
        signup_id: signupId,
        event_id: signup.event_id,
        event_title: signup.event_title,
        payment_type: "cash_to_stripe",
        subtotal: String(eventPrice),
        processing_fee: String(processingFee),
      },
      success_url: `${base}/events/confirmation/${signupId}`,
      cancel_url: `${base}/events/pay/${signupId}`,
    };
    
    const session = await getStripe().checkout.sessions.create(sessionParams);

    return NextResponse.json({
      success: true,
      redirect: session.url!,
    });
  } catch (error: any) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { error: "Failed to create payment session", details: error.message },
      { status: 500 }
    );
  }
}
