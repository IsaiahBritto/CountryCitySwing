import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const { name, message, anonymous } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.PRAYER_USER,
        pass: process.env.PRAYER_PASS,
      },
    });

    const mailOptions = {
      from: process.env.PRAYER_USER,
      to: "prayers.ccs@gmail.com",
      subject: "New Prayer Request - Country City Swing",
      text: `
From: ${anonymous ? "Anonymous" : name || "No name provided"}
Message:
${message}
      `,
    };

    await transporter.sendMail(mailOptions);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Prayer email error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
