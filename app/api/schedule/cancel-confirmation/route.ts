import { NextRequest, NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatEventDateInChicago, formatEventTimeInChicago } from "@/lib/utils/dateHelpers";
import { createScheduleConfirmationEmailHtml } from "@/lib/email/scheduleConfirmationEmail";

/**
 * POST - Send confirmation email to (former) assignee and all admins when someone cancels a schedule slot.
 * Called internally by schedule slot cancel API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      slotId,
      assigneeId,
      assigneeEmail,
      assigneeName,
      position,
      eventId,
    } = body;

    if (!position || eventId == null) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: event } = await supabaseServer
      .from("events")
      .select("id, title, starts_at, location")
      .eq("id", eventId)
      .single();

    const eventDate = event?.starts_at ? formatEventDateInChicago(event.starts_at) : "—";
    const eventTime = event?.starts_at ? formatEventTimeInChicago(event.starts_at) : "";
    const eventTitle = event?.title || "Event";
    const eventLocation = event?.location || "";

    const html = createScheduleConfirmationEmailHtml({
      kind: "cancel",
      recipientName: assigneeName,
      eventTitle,
      position,
      eventDate,
      eventTime,
      eventLocation,
    });

    if (assigneeEmail) {
      await sendHtmlEmail(
        assigneeEmail,
        `Schedule cancelled: ${position} – ${eventTitle} – Country City Swing`,
        html,
        process.env.RESEND_FROM_EMAIL || undefined
      );
    }

    const { data: admins } = await supabaseServer
      .from("profiles")
      .select("email, first_name")
      .eq("role", "admin");

    const adminEmails = (admins || [])
      .map((a: { email?: string }) => a.email)
      .filter(Boolean) as string[];

    for (const adminEmail of adminEmails) {
      if (adminEmail === assigneeEmail) continue;
      try {
        await sendHtmlEmail(
          adminEmail,
          `Schedule update: ${assigneeName} cancelled – ${position} at ${eventTitle}`,
          html,
          process.env.RESEND_FROM_EMAIL || undefined
        );
      } catch (e) {
        console.error("Failed to send admin cancel notification:", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Cancel confirmation email error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to send confirmation email" },
      { status: 500 }
    );
  }
}
