import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseServer } from "@/lib/supabaseServer";

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

  // 2️⃣ Send confirmation email
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = `
    <div style="font-family:sans-serif;padding:20px">
      <h2 style="color:#BB86FC">Country City Swing Signup Confirmation</h2>
      <p>Hi ${firstName},</p>
      <p>You're signed up for <strong>${event.title}</strong> on
      <strong>${new Date(event.date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}</strong> at ${event.location}.</p>
      <p>Payment method: <strong>${paymentMethod}</strong></p>
      <p>Thank you for joining us — we can’t wait to see you on the dance floor!</p>
      <p style="margin-top:30px;color:#888">— The Country City Swing Team</p>
    </div>`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Country City Swing Signup — ${event.title}`,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Failed to send confirmation" },
      { status: 500 }
    );
  }
}
