import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    const { name, message, anonymous } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const emailBody = `
From: ${anonymous ? "Anonymous" : name || "No name provided"}
Message:
${message}
    `;

    await sendMail(
      "New Prayer Request - Country City Swing",
      emailBody,
      "prayers@countrycityswing.dance",
      "prayers@countrycityswing.dance" // from address
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Prayer email error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
