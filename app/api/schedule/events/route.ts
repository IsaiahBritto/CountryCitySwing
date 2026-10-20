import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import { ensureSocialDoormanSlots } from "@/lib/socialScheduleSlotsServer";
import { syncDueClassSchedules } from "@/lib/classScheduleSlotsServer";
import { isValidDateOnly } from "@/lib/schedule/eventDateRange";
import {
  fetchAllEventsOrdered,
  fetchEventsForChicagoDateRange,
} from "@/lib/schedule/scheduleEventsServer";
import { isEventPastInChicago } from "@/lib/utils/dateHelpers";

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { user: null };
  const token = authHeader.replace("Bearer ", "");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await client.auth.getUser(token);
  return { user };
}

function isInstructorOrAdmin(role: string | null): boolean {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "instructor" || r.includes("instructor");
}

async function syncSocialDoormanForEvents(
  events: Array<{
    id: string | number;
    type?: string | null;
    starts_at: string;
    ends_at?: string | null;
    time_zone?: string | null;
  }>
): Promise<void> {
  const social = events.filter((e) => isSocialEventType(e.type));
  await Promise.all(
    social.map((e) => ensureSocialDoormanSlots(e.id, e))
  );
}

/**
 * GET - List events for team schedule.
 * - `from` + `to` (YYYY-MM-DD): events visible in that Chicago calendar month/range.
 * - `scope=upcoming` (default when no range): upcoming events for admin dropdowns.
 * Only instructors and admins.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !isInstructorOrAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get("from")?.trim() ?? "";
    const toDate = searchParams.get("to")?.trim() ?? "";
    if (fromDate || toDate) {
      if (
        !fromDate ||
        !toDate ||
        !isValidDateOnly(fromDate) ||
        !isValidDateOnly(toDate) ||
        fromDate > toDate
      ) {
        return NextResponse.json(
          { error: "Invalid from/to date range (expected YYYY-MM-DD)" },
          { status: 400 }
        );
      }

      await syncDueClassSchedules();

      const inRange = await fetchEventsForChicagoDateRange(fromDate, toDate);
      await syncSocialDoormanForEvents(inRange);

      return NextResponse.json({ events: inRange });
    }

    await syncDueClassSchedules();

    const all = await fetchAllEventsOrdered();
    const upcoming = all.filter(
      (e) => e.starts_at && !isEventPastInChicago(e.starts_at, e.ends_at ?? null)
    );

    await syncSocialDoormanForEvents(upcoming);

    return NextResponse.json({ events: upcoming });
  } catch (e: unknown) {
    console.error("Schedule events GET:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
