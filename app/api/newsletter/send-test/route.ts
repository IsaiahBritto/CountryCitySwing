import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUnsubscribeUrl } from "@/lib/newsletter";
import { buildNewsletterHtml, buildNewsletterText, type NewsletterEventRow } from "@/lib/newsletterEmail";
import {
  getNextSevenDaysUtcRange,
  formatEventDateInChicago,
} from "@/lib/utils/dateHelpers";

/**
 * POST - Send the weekly newsletter to the current user's email (admin only).
 * Used for testing how the email looks.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      }
    );

    const { data: { user }, error: authError } = await client.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired token" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    const role = (profile.role ?? "").trim().toLowerCase();
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only admins can send a test newsletter" },
        { status: 403 }
      );
    }

    const email = (profile.email ?? user.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "No email on your profile; add an email to receive the test" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { start: weekStart, end: weekEnd } = getNextSevenDaysUtcRange();

    const [workshopRes, weekEventsRes] = await Promise.all([
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
    ]);

    const workshop = workshopRes.data?.[0] as NewsletterEventRow | null ?? null;
    const weekEvents = (weekEventsRes.data || []) as NewsletterEventRow[];

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const subject =
      workshop
        ? `This week at Country City Swing – ${workshop.title}`
        : `This week at Country City Swing – ${formatEventDateInChicago(weekStart)}`;

    const unsubscribeUrl = getUnsubscribeUrl(email, baseUrl);
    const html = buildNewsletterHtml(workshop, weekEvents, unsubscribeUrl);
    const text = buildNewsletterText(workshop, weekEvents, unsubscribeUrl);

    await sendHtmlEmail(
      email,
      subject,
      html,
      process.env.RESEND_FROM_EMAIL || undefined,
      text
    );

    return NextResponse.json({ success: true, sentTo: email });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Newsletter send failed";
    console.error("Newsletter send-test error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
