import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";
import { getStripe } from "@/lib/stripe";
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
  const data = await req.json();
  const {
    firstName,
    lastName,
    email,
    beenBefore,
    heardAboutUs,
    paymentMethod,
    acceptLiability,
    acceptPayment,
    event,
    promotionCodeId,
  } = data;

  // 1️⃣ Handle Stripe payment - create signup AFTER payment completes
  if (paymentMethod === "Stripe" && event.price && event.price > 0) {
    try {
      // Generate a UUID for the signup that will be created after payment
      const signupId = randomUUID();
      const base = getBaseUrl(req);
      
      // Calculate processing fee
      const processingFee = roundCurrency(calculateProcessingFee(event.price));
      
      // Build line items: event price + processing fee
      const lineItems: any[] = [
        {
          price_data: {
            currency: "usd",
              product_data: {
                name: event.title,
                description: `Event on ${new Date(event.date).toLocaleDateString()} at ${event.location}`,
                tax_code: getEventTaxCode(), // Educational services/instruction
              },
            unit_amount: Math.round(event.price * 100),
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
      
      // Store all signup data in Stripe metadata - will be used to create signup in webhook
      const sessionParams: any = {
        mode: "payment",
        payment_method_types: ["card"], // Apple Pay and Google Pay are automatically available when "card" is enabled
        line_items: lineItems,
        automatic_tax: {
          enabled: true, // Enable Stripe Tax for automatic sales tax calculation
        },
        allow_promotion_codes: true,
        ...(promotionCodeId
          ? { discounts: [{ promotion_code: promotionCodeId }] }
          : {}),
        customer_email: email,
        billing_address_collection: "auto", // Optional - allows customer to fill in if needed
        client_reference_id: signupId,
        metadata: {
          signup_id: signupId,
          event_id: event.id,
          event_title: event.title,
          first_name: firstName,
          last_name: lastName,
          email: email,
          been_before: beenBefore,
          heard_about_us: heardAboutUs || "",
          payment_method: paymentMethod,
          accept_liability: String(acceptLiability),
          accept_payment: String(acceptPayment),
          payment_type: "stripe_checkout",
          subtotal: String(event.price),
          processing_fee: String(processingFee),
        },
        success_url: `${base}/events/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/events?payment=cancelled`,
      };
      
      const session = await getStripe().checkout.sessions.create(sessionParams);

      // Don't send email yet - will be sent after payment completes in webhook
      return NextResponse.json({
        success: true,
        redirect: session.url!,
      });
    } catch (stripeError: any) {
      console.error("Stripe error:", stripeError);
      return NextResponse.json(
        { error: "Failed to create Stripe session", details: stripeError.message },
        { status: 500 }
      );
    }
  }

  // 2️⃣ Handle non-Stripe payments - create signup immediately
  // If Cash (or other) + promo code brings cost to $0, mark as paid
  let paid = false;
  if (promotionCodeId && event.price != null && event.price > 0) {
    try {
      const stripe = getStripe();
      const promo = await stripe.promotionCodes.retrieve(promotionCodeId, {
        expand: ["coupon"],
      });
      const coupon = (promo as { coupon?: Stripe.Coupon }).coupon;
      if (coupon) {
        let discounted = event.price;
        if (coupon.amount_off != null) {
          discounted = Math.max(0, event.price - coupon.amount_off / 100);
        } else if (coupon.percent_off != null) {
          discounted = Math.max(0, event.price * (1 - coupon.percent_off / 100));
        }
        paid = discounted <= 0;
      }
    } catch (e) {
      console.error("Event signup: could not resolve promo for paid check", e);
    }
  }

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
        payment_method: paymentMethod,
        accept_liability: acceptLiability,
        accept_payment: acceptPayment,
        paid,
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
    paymentMethod === "Cash" && event.price && event.price > 0
      ? paid
        ? `
      <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> No payment needed &mdash; your promotion code covered the full cost.</p>
      </div>
    `
        : `
      <div style="background-color: #fff3cd; border-left: 4px solid #f2c94c; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payment:</strong> Cash payment selected.</p>
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
                <div class="detail-value">${new Date(event.date).toLocaleDateString(undefined, {
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
              ${event.price ? `
              <div class="detail-row">
                <div class="detail-label">Price</div>
                <div class="detail-value">$${event.price.toFixed(2)}</div>
              </div>
              ` : ""}
              <div class="detail-row">
                <div class="detail-label">Payment Method</div>
                <div class="detail-value"><strong>${paymentMethod}</strong></div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Payment Status</div>
                <div class="detail-value" style="color: ${paymentMethod === 'Stripe' ? '#28a745' : '#f2c94c'}; font-weight: bold;">
                  ${paymentMethod === 'Stripe' ? '✓ Paid' : paymentMethod === 'Cash' ? '⏳ Pending - Pay at door' : '✓ Confirmed'}
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
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Failed to send confirmation" },
      { status: 500 }
    );
  }
}
