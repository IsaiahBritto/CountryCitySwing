import { NextRequest, NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  DEFAULT_TIME_ZONE,
  formatEventDateInChicago,
  formatEventTimeInChicago,
} from "@/lib/utils/dateHelpers";
import { createScheduleConfirmationEmailHtml } from "@/lib/email/scheduleConfirmationEmail";
import { formatDoormanTimeRange } from "@/lib/socialScheduleSlots";

async function resolveEventTime(
  slotId: string | null | undefined,
  eventStartsAt: string | null | undefined,
  timeZone: string | null | undefined
): Promise<string> {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  if (slotId) {
    const { data: slot } = await supabaseServer
      .from("team_slots")
      .select("slot_starts_at, slot_ends_at")
      .eq("id", slotId)
      .maybeSingle();
    if (slot?.slot_starts_at && slot?.slot_ends_at) {
      return formatDoormanTimeRange(slot.slot_starts_at, slot.slot_ends_at, tz);
    }
  }
  return eventStartsAt ? formatEventTimeInChicago(eventStartsAt) : "";
}

/**
 * POST - Send confirmation email to (former) assignee and all admins when someone cancels a schedule slot.
 * Called internally by schedule slot cancel API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      slotId,
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
      .select("id, title, starts_at, location, time_zone")
      .eq("id", eventId)
      .single();

    const eventDate = event?.starts_at ? formatEventDateInChicago(event.starts_at) : "—";
    const eventTime = await resolveEventTime(slotId, event?.starts_at, event?.time_zone);
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
  } catch (e) {
    console.error("cancel-confirmation:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
