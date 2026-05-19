import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import { ensureSocialDoormanSlots } from "@/lib/socialScheduleSlotsServer";
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

/**
 * GET - List upcoming events (for Schedule page dropdown and calendar).
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

    const { data: events, error } = await supabaseServer
      .from("events")
      .select("id, title, starts_at, ends_at, location, type, time_zone")
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Error fetching events:", error);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    const upcoming = (events || []).filter(
      (e: { starts_at: string; ends_at?: string | null }) =>
        e.starts_at && !isEventPastInChicago(e.starts_at, e.ends_at ?? null)
    );

    const socialUpcoming = upcoming.filter((e: { type?: string | null }) =>
      isSocialEventType(e.type)
    );
    await Promise.all(
      socialUpcoming.map((e: { id: string | number; type?: string; starts_at: string; ends_at?: string | null; time_zone?: string | null }) =>
        ensureSocialDoormanSlots(e.id, e)
      )
    );

    return NextResponse.json({ events: upcoming });
  } catch (e: any) {
    console.error("Schedule events GET:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
