import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyUnsubscribeToken } from "@/lib/newsletter";

const SITE_NAME = "Country City Swing";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://countrycityswing.dance";

/**
 * GET - One-click unsubscribe: ?email=...&token=...
 * Verifies signed token, sets newsletter_opt_in = false for the profile with that email, returns HTML confirmation.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const token = req.nextUrl.searchParams.get("token");

  if (!email || !token) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;background:#0D0D0D;color:#E5E5E5;">
        <h1 style="color:#F2C94C;">Invalid link</h1>
        <p>The unsubscribe link is missing parameters. You can turn off the weekly email in your <a href="${SITE_URL}/profile" style="color:#F2C94C;">profile</a>.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const decodedEmail = decodeURIComponent(email).trim().toLowerCase();
  if (!verifyUnsubscribeToken(decodedEmail, token)) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:20px;background:#0D0D0D;color:#E5E5E5;">
        <h1 style="color:#F2C94C;">Invalid or expired link</h1>
        <p>This unsubscribe link is invalid or has expired. You can turn off the weekly email in your <a href="${SITE_URL}/profile" style="color:#F2C94C;">profile</a>.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const { error } = await supabaseServer
    .from("profiles")
    .update({ newsletter_opt_in: false })
    .eq("email", decodedEmail);

  if (error) {
    console.error("Newsletter unsubscribe update error:", error);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed – ${SITE_NAME}</title>
</head>
<body style="margin:0;background-color:#0D0D0D;font-family:Inter,system-ui,sans-serif;color:#E5E5E5;line-height:1.6;padding:40px 20px;">
  <div style="max-width:500px;margin:0 auto;text-align:center;">
    <h1 style="color:#F2C94C;margin-bottom:16px;">You're unsubscribed</h1>
    <p style="color:#a3a3a3;">You won't receive the weekly schedule email anymore. You can turn it back on anytime in your <a href="${SITE_URL}/profile" style="color:#F2C94C;">profile</a>.</p>
    <p style="margin-top:24px;"><a href="${SITE_URL}" style="color:#F2C94C;">Back to ${SITE_NAME}</a></p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
