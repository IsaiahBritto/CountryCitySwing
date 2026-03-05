import { NextRequest, NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUnsubscribeUrl } from "@/lib/newsletter";
import { buildNewsletterHtml, buildNewsletterText, type NewsletterEventRow } from "@/lib/newsletterEmail";
import {
  getNextSevenDaysUtcRange,
  formatEventDateInChicago,
} from "@/lib/utils/dateHelpers";

/**
 * GET - Cron: send weekly newsletter (workshop spotlight + this week's events).
 * Auth: CRON_SECRET via ?secret= or Authorization: Bearer.
 */
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const querySecret = req.nextUrl.searchParams.get("secret");
      const authHeader = req.headers.get("authorization");
      const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const provided = querySecret ?? bearerSecret;
      if (provided !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date().toISOString();
    const { start: weekStart, end: weekEnd } = getNextSevenDaysUtcRange();

    const [workshopRes, weekEventsRes, profilesRes] = await Promise.all([
      supabaseServer
        .from("events")
        .select("id, title, starts_at, location, description, signup_link, type")
        .eq("type", "Workshop")
        .gte("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(1),
      supabaseServer
        .from("events")
        .select("id, title, starts_at, location, description, signup_link, type")
        .gte("starts_at", weekStart)
        .lte("starts_at", weekEnd)
        .order("starts_at", { ascending: true }),
      supabaseServer
        .from("profiles")
        .select("email")
        .eq("newsletter_opt_in", true)
        .not("email", "is", null),
    ]);

    const workshop = workshopRes.data?.[0] as NewsletterEventRow | null ?? null;
    const weekEvents = (weekEventsRes.data || []) as NewsletterEventRow[];
    const profiles = (profilesRes.data || []) as { email: string }[];
    const recipients = [...new Set(profiles.map((p) => p.email.trim().toLowerCase()).filter(Boolean))];

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const subject =
      workshop
        ? `This week at Country City Swing – ${workshop.title}`
        : `This week at Country City Swing – ${formatEventDateInChicago(weekStart)}`;

    let sent = 0;
    for (const email of recipients) {
      const unsubscribeUrl = getUnsubscribeUrl(email, baseUrl);
      const html = buildNewsletterHtml(workshop, weekEvents, unsubscribeUrl);
      const text = buildNewsletterText(workshop, weekEvents, unsubscribeUrl);
      try {
        await sendHtmlEmail(
          email,
          subject,
          html,
          process.env.RESEND_FROM_EMAIL || undefined,
          text
        );
        sent++;
      } catch (e) {
        console.error("Newsletter send failed for", email, e);
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    console.error("Newsletter send error:", err);
    return NextResponse.json(
      { error: err.message || "Newsletter send failed" },
      { status: 500 }
    );
  }
}
