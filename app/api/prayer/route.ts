import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { getOptionalUser } from "@/lib/optionalAuth";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { clientIpFromRequest, rateLimit } from "@/lib/spotify/rateLimit";

export async function POST(req: Request) {
  try {
    const { name, message, anonymous, turnstileToken } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const user = await getOptionalUser(req);

    if (!user) {
      const ip = clientIpFromRequest(req);
      const limited = rateLimit({
        key: `prayer:${ip}`,
        limit: 5,
        windowMs: 10 * 60_000,
      });
      if (!limited.ok) {
        return NextResponse.json(
          { error: "Too many requests. Try again shortly." },
          {
            status: 429,
            headers: { "Retry-After": String(limited.retryAfterSec) },
          }
        );
      }

      if (!turnstileToken) {
        return NextResponse.json({ error: "Captcha required" }, { status: 403 });
      }

      const { success } = await verifyTurnstileToken(turnstileToken, ip);
      if (!success) {
        return NextResponse.json(
          { error: "Captcha verification failed" },
          { status: 403 }
        );
      }
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
