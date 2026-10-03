import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  isTuesdayClassEvent,
  resolveWeekLetterForEvent,
  type ClassScheduleEventInput,
} from "@/lib/classScheduleRotation";
import {
  loadRotationAnchorConfig,
} from "@/lib/classScheduleSlotsServer";

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

function isAdmin(role: string | null): boolean {
  return (role || "").trim().toLowerCase() === "admin";
}

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

    if (!profile || !isAdmin(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const eventId = req.nextUrl.searchParams.get("event_id");
    const startsAt = req.nextUrl.searchParams.get("starts_at");
    const weekOverride = req.nextUrl.searchParams.get("class_week_override");

    let target: ClassScheduleEventInput | null = null;

    if (eventId) {
      const { data } = await supabaseServer
        .from("events")
        .select("id, type, starts_at, time_zone, class_week_override")
        .eq("id", eventId)
        .maybeSingle();
      if (data) {
        target = data as ClassScheduleEventInput;
        if (weekOverride !== null && weekOverride !== "") {
          target = {
            ...target,
            class_week_override: weekOverride === "auto" ? null : weekOverride,
          };
        }
      }
    } else if (startsAt) {
      target = {
        id: "preview",
        type: "class",
        starts_at: startsAt,
        time_zone: req.nextUrl.searchParams.get("time_zone") || "America/Chicago",
        class_week_override:
          weekOverride && weekOverride !== "auto" ? weekOverride : null,
      };
    }

    if (!target || !isTuesdayClassEvent(target)) {
      return NextResponse.json({
        isTuesdayClass: false,
        week: null,
      });
    }

    const anchor = await loadRotationAnchorConfig();
    const { data: allEvents } = await supabaseServer
      .from("events")
      .select("id, type, starts_at, time_zone, class_week_override")
      .order("starts_at", { ascending: true });

    const tuesdayEvents = (allEvents || []).filter((e) =>
      isTuesdayClassEvent(e as ClassScheduleEventInput)
    ) as ClassScheduleEventInput[];

    if (eventId && !tuesdayEvents.some((e) => String(e.id) === String(eventId))) {
      tuesdayEvents.push(target);
      tuesdayEvents.sort(
        (a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime()
      );
    } else if (!eventId) {
      tuesdayEvents.push(target);
      tuesdayEvents.sort(
        (a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime()
      );
    }

    const eventIds = tuesdayEvents.map((e) => String(e.id));
    const { data: slotRows } = await supabaseServer
      .from("team_slots")
      .select("event_id, position")
      .in("event_id", eventIds.filter((id) => id !== "preview"));

    const slotsByEvent = new Map<string, { position?: string }[]>();
    for (const row of slotRows || []) {
      const key = String((row as { event_id: string | number }).event_id);
      const list = slotsByEvent.get(key) || [];
      list.push({ position: (row as { position?: string }).position });
      slotsByEvent.set(key, list);
    }

    const week = resolveWeekLetterForEvent(target, tuesdayEvents, anchor, slotsByEvent);

    return NextResponse.json({
      isTuesdayClass: true,
      week,
    });
  } catch (e: unknown) {
    console.error("class-week-preview:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
