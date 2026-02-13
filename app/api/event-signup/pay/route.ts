import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";
import { sendHtmlEmail } from "@/lib/mailer";
import eventsData from "@/lib/events.json";
import { calculateProcessingFee, getDiscountedSubtotalFromCoupon, roundCurrency } from "@/lib/utils/paymentHelpers";
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
    const { signupId, promotionCodeId, discountedSubtotal: clientDiscountedSubtotal } = await req.json();

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

    // Resolve base event price (stored amount_owed or event price)
    const hasStoredAmountOwed = signup.amount_owed != null && Number(signup.amount_owed) >= 0;
    let basePrice = hasStoredAmountOwed ? Number(signup.amount_owed) : null;

    if (basePrice === null && signup.event_id) {
      try {
        const { data: eventData } = await supabaseServer
          .from("events")
          .select("price")
          .eq("id", signup.event_id)
          .single();
        if (eventData?.price) {
          basePrice = Number(eventData.price);
        }
      } catch (e) {
        const event = (eventsData as any[]).find((e: any) => e.id === signup.event_id);
        if (event?.price) {
          basePrice = Number(event.price);
        }
      }
    }

    if (basePrice === null || basePrice < 0) {
      basePrice = 0;
    }

    // When a promo is applied, compute discounted amount (client value or Stripe)
    let amountDue: number = basePrice;
    if (promotionCodeId) {
      if (typeof clientDiscountedSubtotal === "number" && clientDiscountedSubtotal >= 0) {
        amountDue = roundCurrency(clientDiscountedSubtotal);
      } else {
        try {
          const stripe = getStripe();
          const promo = await stripe.promotionCodes.retrieve(promotionCodeId, {
            expand: ["coupon"],
          });
          let coupon: unknown = (promo as { coupon?: unknown }).coupon;
          if (!coupon || typeof coupon !== "object") {
            const id =
              typeof coupon === "string" && coupon.startsWith("coupon_")
                ? coupon
                : (await stripe.promotionCodes.retrieve(promotionCodeId) as { coupon?: string }).coupon;
            if (typeof id === "string" && id.startsWith("coupon_")) {
              coupon = await stripe.coupons.retrieve(id);
            }
          }
          if (coupon && typeof coupon === "object") {
            amountDue = roundCurrency(
              getDiscountedSubtotalFromCoupon(coupon, basePrice)
            );
          }
        } catch (e) {
          console.error("Event signup pay: could not resolve promo", e);
        }
      }

      // Promo brings total to zero: mark paid and send confirmation email; record free-via-promo and used_promotion_code for finances
      if (amountDue <= 0.5) {
        const { error: updateError } = await supabaseServer
          .from("signups")
          .update({
            paid: true,
            amount_owed: 0,
            free_via_promotion_code: true,
            used_promotion_code: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", signupId);

        if (updateError) {
          console.error("Event signup pay: failed to update signup", signupId, updateError);
          return NextResponse.json(
            { error: "Failed to update registration" },
            { status: 500 }
          );
        }

        // Fetch event for email
        let eventDate = "";
        let eventLocation = "";
        if (signup.event_id) {
          const { data: ev } = await supabaseServer
            .from("events")
            .select("starts_at, location")
            .eq("id", signup.event_id)
            .single();
          if (ev?.starts_at) {
            eventDate = new Date(ev.starts_at).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
          }
          if (ev?.location) eventLocation = ev.location;
        }

        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #f2c94c; color: #000; padding: 20px; text-align: center; }
                .content { background-color: #f9f9f9; padding: 20px; }
                .details-box { background-color: white; border: 2px solid #f2c94c; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }
                .detail-row:last-child { border-bottom: none; }
                .detail-label { font-weight: bold; color: #666; font-size: 0.9em; margin-bottom: 5px; }
                .detail-value { font-size: 1.1em; color: #333; }
                .payment-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Country City Swing</h1>
                  <h2>You're All Set!</h2>
                </div>
                <div class="content">
                  <p>Hi <strong>${signup.first_name} ${signup.last_name}</strong>,</p>
                  <p>Your promotion code covered the full cost of the event. No payment is required.</p>
                  <div class="details-box">
                    <h3 style="margin-top: 0; color: #f2c94c; font-size: 1.3em;">Registration Details</h3>
                    <div class="detail-row">
                      <div class="detail-label">Event</div>
                      <div class="detail-value"><strong>${signup.event_title || "Event"}</strong></div>
                    </div>
                    ${eventDate ? `<div class="detail-row"><div class="detail-label">Date</div><div class="detail-value">${eventDate}</div></div>` : ""}
                    ${eventLocation ? `<div class="detail-row"><div class="detail-label">Location</div><div class="detail-value">${eventLocation}</div></div>` : ""}
                    <div class="detail-row">
                      <div class="detail-label">Amount due (after discount)</div>
                      <div class="detail-value">$0.00 — Paid in full by promotion code</div>
                    </div>
                    <div class="detail-row">
                      <div class="detail-label">Payment Status</div>
                      <div class="detail-value" style="color: #28a745; font-weight: bold;">✓ Paid</div>
                    </div>
                  </div>
                  <p>We can't wait to see you on the dance floor!</p>
                  <p style="margin-top: 20px; font-size: 0.9em; color: #666;">Questions? Contact us at contact.us@countrycityswing.dance</p>
                </div>
                <div class="footer">
                  <p>Country City Swing<br>Nashville, TN</p>
                </div>
              </div>
            </body>
          </html>`;

        try {
          await sendHtmlEmail(
            signup.email,
            `You're all set — ${signup.event_title || "Event"}`,
            emailHtml,
            "confirmation@countrycityswing.dance"
          );
        } catch (e) {
          console.error("Event signup pay: failed to send confirmation email", e);
        }

        return NextResponse.json({
          success: true,
          noPaymentRequired: true,
          message: "Your promotion code covered the full cost. No payment required.",
        });
      }
    }

    // Already paid (amount_owed was 0)
    if (hasStoredAmountOwed && Number(signup.amount_owed) === 0) {
      return NextResponse.json(
        { error: "No payment required. Your promotion code already covered the full cost." },
        { status: 400 }
      );
    }

    if (amountDue <= 0) {
      return NextResponse.json(
        { error: "Event price not found or event is free. Please contact support." },
        { status: 400 }
      );
    }

    // Optionally persist discounted amount so pay page shows correct amount if they return
    if (promotionCodeId && amountDue !== basePrice) {
      await supabaseServer
        .from("signups")
        .update({ amount_owed: roundCurrency(amountDue), updated_at: new Date().toISOString() })
        .eq("id", signupId);
    }

    const eventPrice = amountDue;

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
        used_promotion_code: promotionCodeId ? "true" : "false",
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
