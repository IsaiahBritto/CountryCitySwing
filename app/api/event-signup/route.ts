import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";
import { getStripe } from "@/lib/stripe";

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
  } = data;

  // 1️⃣ Save to Supabase
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


  // 2️⃣ Handle Stripe payment
  if (paymentMethod === "Stripe" && event.price && event.price > 0) {
    try {
      const base = getBaseUrl(req);
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: event.title,
                description: `Event on ${new Date(event.date).toLocaleDateString()} at ${event.location}`,
              },
              unit_amount: Math.round(event.price * 100),
            },
            quantity: 1,
          },
        ],
        customer_email: email,
        client_reference_id: signupId,
        metadata: {
          signup_id: signupId,
          event_id: event.id,
          event_title: event.title,
        },
        success_url: `${base}/events?payment=success`,
        cancel_url: `${base}/events?payment=cancelled`,
      });

      // Send confirmation email (payment will be confirmed via webhook)
      const html = `
        <div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">
          <h2 style="color:#F2C94C;margin-bottom:20px">Country City Swing Signup Confirmation</h2>
          <p style="font-size:16px;line-height:1.6">Hi ${firstName},</p>
          <p style="font-size:16px;line-height:1.6">You're signed up for <strong>${event.title}</strong> on
          <strong>${new Date(event.date).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}</strong> at ${event.location}.</p>
          ${event.price ? `<p style="font-size:16px;line-height:1.6"><strong>Price:</strong> $${event.price.toFixed(2)}</p>` : ""}
          <p style="font-size:16px;line-height:1.6">Payment method: <strong>Stripe (Credit/Debit Card)</strong></p>
          <p style="font-size:16px;line-height:1.6;margin-top:20px">Please complete your payment to secure your spot.</p>
          <p style="font-size:16px;line-height:1.6;margin-top:20px">Thank you for joining us — we can't wait to see you on the dance floor!</p>
          <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
        </div>`;

      try {
        await sendHtmlEmail(
          email,
          `Country City Swing Signup — ${event.title}`,
          html,
          "confirmation@countrycityswing.dance"
        );
      } catch (err) {
        console.error("Email send error:", err);
      }

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

  // 3️⃣ Handle Cash payment - send email with payment link
  const base = getBaseUrl(req);
  const paymentLink = `${base}/events/pay/${signupId}`;
  
  const paymentSection = paymentMethod === "Cash" && event.price && event.price > 0
    ? `
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

  const html = `
    <div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">
      <h2 style="color:#F2C94C;margin-bottom:20px">Country City Swing Signup Confirmation</h2>
      <p style="font-size:16px;line-height:1.6">Hi ${firstName},</p>
      <p style="font-size:16px;line-height:1.6">You're signed up for <strong>${event.title}</strong> on
      <strong>${new Date(event.date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}</strong> at ${event.location}.</p>
      ${event.price ? `<p style="font-size:16px;line-height:1.6"><strong>Price:</strong> $${event.price.toFixed(2)}</p>` : ""}
      <p style="font-size:16px;line-height:1.6">Payment method: <strong>${paymentMethod}</strong></p>
      ${paymentSection}
      <p style="font-size:16px;line-height:1.6;margin-top:20px">Thank you for joining us — we can't wait to see you on the dance floor!</p>
      <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
    </div>`;

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
