import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  buildRegistrationBroadcastHtml,
  buildRegistrationBroadcastText,
} from "@/lib/email/registrationBroadcastEmail";
import { sendHtmlEmail } from "@/lib/mailer";
import {
  collectCompSignupRecipients,
  collectSignupRecipients,
  type BroadcastAudience,
} from "@/lib/registrationBroadcastRecipients";
import { supabaseServer } from "@/lib/supabaseServer";

const SIGNUPS_SELECT =
  "id,first_name,last_name,email,paid,refunded_or_cancelled";

const COMP_SIGNUPS_SELECT =
  "id,paid,refunded_or_cancelled,strictly_lead_first_name,strictly_lead_last_name,strictly_lead_email,strictly_follow_first_name,strictly_follow_last_name,strictly_follow_email,jnj_lead_first_name,jnj_lead_last_name,jnj_lead_email,jnj_follow_first_name,jnj_follow_last_name,jnj_follow_email";

function parseAudience(value: unknown): BroadcastAudience | null {
  if (value === "all" || value === "unpaid") return value;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      event_id?: string;
      audience?: string;
      subject?: string;
      body_text?: string;
      dry_run?: boolean;
    };

    const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
    const audience = parseAudience(body.audience);
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const bodyText = typeof body.body_text === "string" ? body.body_text.trim() : "";
    const dryRun = body.dry_run === true;

    if (!eventId) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json(
        { error: "audience must be all or unpaid" },
        { status: 400 }
      );
    }
    if (!dryRun) {
      if (!subject) {
        return NextResponse.json({ error: "subject is required" }, { status: 400 });
      }
      if (!bodyText) {
        return NextResponse.json({ error: "body_text is required" }, { status: 400 });
      }
      if (subject.length > 200) {
        return NextResponse.json(
          { error: "subject must be 200 characters or fewer" },
          { status: 400 }
        );
      }
      if (bodyText.length > 8000) {
        return NextResponse.json(
          { error: "body_text must be 8000 characters or fewer" },
          { status: 400 }
        );
      }
    }

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id,title,starts_at,ends_at,location,time_zone,type")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const isComp = String(event.type || "").toLowerCase() === "comp";
    let recipients;

    if (isComp) {
      const { data, error } = await supabaseServer
        .from("comp_signups")
        .select(COMP_SIGNUPS_SELECT)
        .eq("event_id", eventId);
      if (error) {
        return NextResponse.json(
          { error: "Failed to load comp signups" },
          { status: 500 }
        );
      }
      recipients = collectCompSignupRecipients(data ?? [], audience);
    } else {
      const { data, error } = await supabaseServer
        .from("signups")
        .select(SIGNUPS_SELECT)
        .eq("event_id", eventId);
      if (error) {
        return NextResponse.json(
          { error: "Failed to load signups" },
          { status: 500 }
        );
      }
      recipients = collectSignupRecipients(data ?? [], audience);
    }

    if (dryRun) {
      return NextResponse.json({
        eventId,
        audience,
        recipientCount: recipients.length,
        recipients: recipients.map((r) => ({
          email: r.email,
          name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
        })),
      });
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients match this audience" },
        { status: 400 }
      );
    }

    let sent = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (const recipient of recipients) {
      try {
        const html = buildRegistrationBroadcastHtml({
          event,
          bodyText,
          recipientFirstName: recipient.firstName,
        });
        const text = buildRegistrationBroadcastText({
          event,
          bodyText,
          recipientFirstName: recipient.firstName,
        });
        await sendHtmlEmail(
          recipient.email,
          subject,
          html,
          process.env.RESEND_FROM_EMAIL || "confirmation@countrycityswing.dance",
          text,
          undefined,
          "contact.us@countrycityswing.dance"
        );
        sent += 1;
      } catch (error) {
        failures.push({
          email: recipient.email,
          error: error instanceof Error ? error.message : "Send failed",
        });
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      sent,
      failed: failures.length,
      recipientCount: recipients.length,
      failures,
    });
  } catch (error) {
    console.error("[registration/broadcast] POST failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to send broadcast email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
