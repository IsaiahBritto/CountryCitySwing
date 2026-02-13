import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";
import { getStripe } from "@/lib/stripe";
import { getDiscountedAmountForPromotion } from "@/lib/stripePromo";
import { randomUUID } from "crypto";
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
  console.log("[event-signup] POST /api/event-signup called");
  const data = await req.json();
  const {
    firstName,
    lastName,
    email,
    beenBefore,
    heardAboutUs,
    paymentMethod,
    friendPaidHow,
    acceptLiability,
    acceptPayment,
    is_ccs_team: isCcsTeamFromBody,
    event: eventPayload,
    promotionCodeId: promotionCodeIdFromBody,
    discountedSubtotal: clientDiscountedSubtotalFromBody,
  } = data;
  const isCcsTeam = isCcsTeamFromBody === true || isCcsTeamFromBody === "true";

  // Normalize event and price (client may send snake_case or price as string)
  const event = eventPayload ?? data.event ?? {};
  const eventId = event?.id;
  const emailTrimmed = typeof email === "string" ? email.trim().toLowerCase() : "";

  // Sanity check: reject if already registered for this event (event_id + email)
  if (eventId && emailTrimmed) {
    const { data: existing } = await supabaseServer
      .from("signups")
      .select("id")
      .eq("event_id", eventId)
      .ilike("email", emailTrimmed)
      .maybeSingle();
    if (existing) {
      const eventTitle = event.title ?? "This event";
      const eventDate = event.starts_at
        ? new Date(event.starts_at).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : "";
      return NextResponse.json(
        {
          error: "Already registered",
          alreadyRegistered: true,
          eventTitle,
          eventDate,
        },
        { status: 409 }
      );
    }
  }

  const eventPriceNum =
    typeof event.price === "number"
      ? event.price
      : typeof event.price === "string"
        ? parseFloat(event.price)
        : Number((event as Record<string, unknown>)?.price);
  let eventPrice = Number.isFinite(eventPriceNum) ? eventPriceNum : 0;

  // If event price missing but we have event.id, fetch from DB (so Cash + promo can apply)
  if (eventPrice <= 0 && event?.id) {
    try {
      const { data: ev } = await supabaseServer
        .from("events")
        .select("price")
        .eq("id", event.id)
        .single();
      if (ev?.price != null) {
        const p = Number(ev.price);
        if (Number.isFinite(p)) eventPrice = p;
      }
    } catch (_) {
      // ignore
    }
  }

  // Accept promo from body (camelCase or snake_case)
  const promotionCodeId =
    promotionCodeIdFromBody ??
    (data.promotionCodeId as string | undefined) ??
    (data.promotion_code_id as string | undefined);
  const clientDiscountedSubtotal =
    typeof clientDiscountedSubtotalFromBody === "number"
      ? clientDiscountedSubtotalFromBody
      : typeof clientDiscountedSubtotalFromBody === "string"
        ? parseFloat(clientDiscountedSubtotalFromBody)
        : typeof data.discounted_subtotal === "number"
          ? data.discounted_subtotal
          : typeof data.discounted_subtotal === "string"
            ? parseFloat(data.discounted_subtotal)
            : undefined;

  let paid = false;
  let amountOwed = eventPrice;
  // Normalize so "Cash" / "cash" etc. are treated as cash path
  const paymentMethodNorm = typeof paymentMethod === "string" ? paymentMethod.trim() : "";
  let effectivePaymentMethod =
    paymentMethodNorm.toLowerCase() === "cash" ? "Cash" : paymentMethod;

  // 1️⃣ Stripe path: if event cost after promo (no processing fee, no tax) is ≤$0.50, treat as Cash with no payment
  if (effectivePaymentMethod === "Stripe" && eventPrice > 0) {
    const processingFee = roundCurrency(calculateProcessingFee(eventPrice));
    let discountedEventOnly = eventPrice;
    if (promotionCodeId) {
      const discounted = await getDiscountedAmountForPromotion(promotionCodeId, eventPrice);
      if (discounted !== null) discountedEventOnly = discounted;
    }
    if (discountedEventOnly <= 0.5) {
      effectivePaymentMethod = "Cash";
      paid = true;
      amountOwed = 0;
    } else {
      try {
        const signupId = randomUUID();
        const base = getBaseUrl(req);
        const lineItems: any[] = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: event.title,
                description: `Event on ${new Date(event.starts_at).toLocaleDateString()} at ${event.location}`,
                tax_code: getEventTaxCode(),
              },
              unit_amount: Math.round(eventPrice * 100),
            },
            quantity: 1,
          },
        ];
        if (processingFee > 0) {
          lineItems.push({
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
          });
        }
        const sessionParams: any = {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: lineItems,
          automatic_tax: { enabled: true },
          ...(promotionCodeId
            ? { discounts: [{ promotion_code: promotionCodeId }] }
            : { allow_promotion_codes: true }),
          customer_email: email,
          billing_address_collection: "auto",
          client_reference_id: signupId,
          metadata: {
            signup_id: signupId,
            event_id: event.id,
            event_title: event.title,
            first_name: firstName,
            last_name: lastName,
            email,
            been_before: beenBefore,
            heard_about_us: heardAboutUs || "",
            payment_method: paymentMethod,
            accept_liability: String(acceptLiability),
            accept_payment: String(acceptPayment),
            payment_type: "stripe_checkout",
            subtotal: String(eventPrice),
            processing_fee: String(processingFee),
            used_promotion_code: promotionCodeId ? "true" : "false",
          },
          success_url: `${base}/events/confirmation?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/events?payment=cancelled`,
        };
        const session = await getStripe().checkout.sessions.create(sessionParams);
        return NextResponse.json({ success: true, redirect: session.url! });
      } catch (stripeError: any) {
        console.error("Stripe error:", stripeError);
        return NextResponse.json(
          { error: "Failed to create Stripe session", details: stripeError.message },
          { status: 500 }
        );
      }
    }
  }

  // 2️⃣ Non-Stripe (Cash or Stripe→Cash): create signup immediately
  // If Cash + promo, apply discount: prefer server-side Stripe when we have promotionCodeId
  const isCashPath = effectivePaymentMethod !== "Stripe";

  // Log so you can see in Vercel Logs (Project → Logs): whether we have promo and which path we're on
  console.log("[event-signup]", JSON.stringify({
    paymentMethod: paymentMethodNorm?.slice(0, 20),
    effectivePaymentMethod: effectivePaymentMethod?.slice(0, 20),
    isCashPath,
    eventPrice,
    hasPromoId: !!promotionCodeId,
    clientDiscountedSubtotal: clientDiscountedSubtotal ?? null,
  }));

  if (isCashPath && (eventPrice > 0 || promotionCodeId != null)) {
    let resolvedAmount: number | null = null;
    if (promotionCodeId) {
      resolvedAmount = await getDiscountedAmountForPromotion(promotionCodeId, eventPrice);
      if (resolvedAmount !== null) {
        console.log("[event-signup] Stripe coupon applied", { resolvedAmount });
      }
    }
    if (resolvedAmount === null &&
        typeof clientDiscountedSubtotal === "number" &&
        !Number.isNaN(clientDiscountedSubtotal) &&
        clientDiscountedSubtotal >= 0) {
      resolvedAmount = roundCurrency(clientDiscountedSubtotal);
      console.log("[event-signup] used clientDiscountedSubtotal", { resolvedAmount });
    }
    if (resolvedAmount !== null) {
      amountOwed = resolvedAmount;
      paid = amountOwed <= 0;
    }
    console.log("[event-signup] after discount block", { amountOwed, paid });
  }

  if (amountOwed <= 0) paid = true;

  // "A friend paid for me" + Stripe → mark as paid
  if (
    effectivePaymentMethod === "A friend paid for me" &&
    (friendPaidHow === "Stripe" || data.friend_paid_via_stripe === true)
  ) {
    paid = true;
    amountOwed = 0;
  }

  const freeViaPromo = !!(promotionCodeId && amountOwed <= 0);
  const usedPromo = !!promotionCodeId;

  const { data: insertedSignup, error: insertError } = await supabaseServer
    .from("signups")
    .insert([
      {
        event_id: event.id,
        event_title: event.title,
        first_name: firstName,
        last_name: lastName,
        email,
        been_before: beenBefore,
        heard_about_us: heardAboutUs,
        payment_method: effectivePaymentMethod,
        accept_liability: acceptLiability,
        accept_payment: acceptPayment,
        paid,
        amount_owed: roundCurrency(amountOwed),
        is_ccs_team: isCcsTeam,
        ...(freeViaPromo ? { free_via_promotion_code: true } : {}),
        ...(usedPromo ? { used_promotion_code: true } : {}),
      },
    ])
    .select()
    .single();

  if (insertError) {
    console.error("Supabase insert error:", insertError);
    return NextResponse.json(
      { 
        error: "Failed to save signup",
        details: insertError.message || insertError.code
      },
      { status: 500 }
    );
  }

  const signupId = insertedSignup.id;

  // 3️⃣ Handle Cash payment - send email with payment link
  const base = getBaseUrl(req);
  const paymentLink = `${base}/events/pay/${signupId}`;
  
  const paymentSection =
    effectivePaymentMethod === "Cash" && eventPrice > 0
      ? paid
        ? `
      <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> Paid.</p>
        <p style="margin: 8px 0 0 0;">Your promotion code covered the full cost. No payment is required.</p>
      </div>
    `
        : `
      <div style="background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> Cash payment selected.</p>
        <p style="margin: 10px 0 0 0;"><strong>Amount due:</strong> $${amountOwed.toFixed(2)}</p>
        <p style="margin: 10px 0 0 0;">You can pay with cash at the door, or click the link below to pay online via Stripe:</p>
        <p style="margin: 10px 0 0 0;">
          <a href="${paymentLink}" style="display: inline-block; background-color: #F2C94C; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
            Pay Online via Stripe
          </a>
        </p>
      </div>
    `
      : "";

  // 4️⃣ Send confirmation email for non-Stripe payments
  const html = `
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
          .payment-box { background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Country City Swing</h1>
            <h2>Registration Confirmation</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${firstName} ${lastName}</strong>,</p>
            <p>You're signed up for the event! We're excited to see you there.</p>
            
            <div class="details-box">
              <h3 style="margin-top: 0; color: #f2c94c; font-size: 1.3em;">Registration Details</h3>
              <div class="detail-row">
                <div class="detail-label">Name</div>
                <div class="detail-value">${firstName} ${lastName}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Event</div>
                <div class="detail-value"><strong>${event.title}</strong></div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Date</div>
                <div class="detail-value">${new Date(event.starts_at).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}</div>
              </div>
              ${event.location ? `
              <div class="detail-row">
                <div class="detail-label">Location</div>
                <div class="detail-value">${event.location}</div>
              </div>
              ` : ""}
              ${eventPrice > 0 ? `
              <div class="detail-row">
                <div class="detail-label">Amount due (after discount)</div>
                <div class="detail-value">$${amountOwed.toFixed(2)}${paid ? ' — Paid in full by promotion code' : ''}</div>
              </div>
              ` : ""}
              <div class="detail-row">
                <div class="detail-label">Payment Method</div>
                <div class="detail-value"><strong>${effectivePaymentMethod}</strong></div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Payment Status</div>
                <div class="detail-value" style="color: ${paid ? '#28a745' : '#f2c94c'}; font-weight: bold;">
                  ${paid ? '✓ Paid' : effectivePaymentMethod === 'Cash' ? '⏳ Pending - Pay at door' : '✓ Confirmed'}
                </div>
              </div>
            </div>
            
            ${paymentSection}
            
            <p>Thank you for joining us — we can't wait to see you on the dance floor!</p>
            <p style="margin-top: 20px; font-size: 0.9em; color: #666;">If you have any questions, please contact us at contact.us@countrycityswing.dance</p>
          </div>
          <div class="footer">
            <p>Country City Swing<br>Nashville, TN</p>
          </div>
        </div>
      </body>
    </html>`;

  try {
    await sendHtmlEmail(
      email,
      `Country City Swing Signup — ${event.title}`,
      html,
      "confirmation@countrycityswing.dance"
    );
    // Same success message for Cash or Stripe→Cash when promo covered full cost
    if (effectivePaymentMethod === "Cash" && paid) {
      return NextResponse.json({
        success: true,
        noRedirect: true,
        message: "Your total after discount is $0. No payment required.",
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Failed to send confirmation" },
      { status: 500 }
    );
  }
}
