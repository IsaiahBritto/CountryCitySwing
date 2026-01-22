import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendHtmlEmail } from "@/lib/mailer";

export async function POST(req: Request) {
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
  const { error: insertError } = await supabaseServer.from("signups").insert([
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
  ]);

  if (insertError) {
    console.error("Supabase insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to save signup" },
      { status: 500 }
    );
  }

  // 2️⃣ Send confirmation email using Resend
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
      <p style="font-size:16px;line-height:1.6">Payment method: <strong>${paymentMethod}</strong></p>
      <p style="font-size:16px;line-height:1.6;margin-top:20px">Thank you for joining us — we can't wait to see you on the dance floor!</p>
      <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
    </div>`;

  try {
    await sendHtmlEmail(
      email,
      `Country City Swing Signup — ${event.title}`,
      html,
      "signup.confirmation@countrycityswing.dance"
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
