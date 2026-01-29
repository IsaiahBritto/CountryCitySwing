import { NextRequest, NextResponse } from "next/server";
import { sendHtmlEmail } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabaseServer";
import dayjs from "dayjs";

/**
 * GET - Cron: at 10am, send reminder emails to everyone signed up for an event that day (any time).
 * Call from Vercel Cron once daily (e.g. 0 10 * * * for 10am).
 * Auth: set CRON_SECRET and pass via ?secret=CRON_SECRET or Authorization: Bearer CRON_SECRET.
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

    const today = dayjs().format("YYYY-MM-DD");

    const { data: events } = await supabaseServer
      .from("events")
      .select("id, title, date, start_time, location")
      .eq("date", today)
      .order("start_time", { ascending: true });

    if (!events?.length) {
      return NextResponse.json({ sent: 0, message: "No events today" });
    }

    let sent = 0;

    for (const event of events) {
      const eventDate = dayjs(event.date);
      const eventTime = event.start_time ? dayjs(event.start_time) : eventDate.startOf("day");
      const eventStart = eventDate
        .hour(eventTime.hour())
        .minute(eventTime.minute())
        .second(0)
        .millisecond(0);

      const { data: slots } = await supabaseServer
        .from("team_slots")
        .select("assignee_id")
        .eq("event_id", event.id)
        .not("assignee_id", "is", null);

      const assigneeIds = [...new Set((slots || []).map((s: any) => s.assignee_id).filter(Boolean))];
      if (assigneeIds.length === 0) continue;

      const { data: profiles } = await supabaseServer
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("id", assigneeIds);

      const eventDateStr = eventStart.format("dddd, MMMM D, YYYY");
      const eventTimeStr = event.start_time
        ? eventStart.format("h:mm A")
        : "";

      const html = `
        <div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">
          <h2 style="color:#F2C94C;margin-bottom:20px">Reminder: Event Today</h2>
          <p style="font-size:16px;line-height:1.6">You're signed up to help at:</p>
          <div style="background-color:#1a1a1a;padding:20px;border-radius:8px;margin:20px 0">
            <p style="margin:10px 0;font-size:16px"><strong style="color:#F2C94C">${event.title}</strong></p>
            <p style="margin:10px 0;font-size:16px">${eventDateStr}${eventTimeStr ? ` at ${eventTimeStr}` : ""}</p>
            ${event.location ? `<p style="margin:10px 0;font-size:16px">📍 ${event.location}</p>` : ""}
          </div>
          <p style="font-size:16px;line-height:1.6">See you there!</p>
          <p style="margin-top:30px;color:#888;font-size:14px">— The Country City Swing Team</p>
        </div>`;

      for (const p of profiles || []) {
        const email = (p as any).email;
        if (!email) continue;
        try {
          await sendHtmlEmail(
            email,
            `Reminder: ${event.title} – today – Country City Swing`,
            html,
            process.env.RESEND_FROM_EMAIL || undefined
          );
          sent++;
        } catch (e) {
          console.error("Reminder email failed for", email, e);
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    console.error("Schedule reminder cron error:", err);
    return NextResponse.json(
      { error: err.message || "Reminder cron failed" },
      { status: 500 }
    );
  }
}
