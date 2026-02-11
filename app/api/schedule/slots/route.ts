import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

const POSITIONS = [
  "Beginner Lead Teacher Week A",
  "Beginner Follow Teacher Week A",
  "Beginner Lead Teacher Week B",
  "Beginner Follow Teacher Week B",
  "Beginner Lead Teacher Week C",
  "Beginner Follow Teacher Week C",
  "Doorman",
  "Other Help",
] as const;

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

function isAdmin(role: string | null): boolean {
  return (role || "").toLowerCase() === "admin";
}

/**
 * GET - List event slots (optionally by event_id or date range).
 * Instructors and admins only.
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
    const eventId = searchParams.get("event_id");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    let query = supabaseServer
      .from("team_slots")
      .select("id, position, event_id, assignee_id, assigned_at, created_at, updated_at");

    if (eventId) query = query.eq("event_id", eventId);

    const { data: slots, error } = await query.order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching slots:", error);
      return NextResponse.json({ error: "Failed to fetch slots" }, { status: 500 });
    }

    const slotList = slots || [];
    const eventIds = [...new Set(slotList.map((s: any) => s.event_id))];
    const assigneeIds = [...new Set(slotList.map((s: any) => s.assignee_id).filter(Boolean))];

    const [eventsRes, profilesRes] = await Promise.all([
      eventIds.length ? supabaseServer.from("events").select("id, title, starts_at, location").in("id", eventIds) : { data: [] },
      assigneeIds.length ? supabaseServer.from("profiles").select("id, first_name, last_name").in("id", assigneeIds) : { data: [] },
    ]);

    const eventsMap = new Map((eventsRes.data || []).map((e: any) => [e.id, e]));
    const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

    let result = slotList.map((s: any) => ({
      ...s,
      event: eventsMap.get(s.event_id) || null,
      assignee: s.assignee_id ? profilesMap.get(s.assignee_id) || null : null,
    }));

    if (fromDate || toDate) {
      result = result.filter((s: any) => {
        const startsAt = s.event?.starts_at;
        if (!startsAt) return false;
        const d = startsAt.slice(0, 10);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }

    return NextResponse.json({ slots: result });
  } catch (e: any) {
    console.error("Schedule slots GET:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST - Create a new event slot (admin only).
 * Body: { position, event_id }
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { position, event_id: eventId } = body;

    if (!position || eventId == null) {
      return NextResponse.json(
        { error: "Missing required fields: position, event_id" },
        { status: 400 }
      );
    }

    if (!POSITIONS.includes(position)) {
      return NextResponse.json(
        { error: "Invalid position. Must be one of: " + POSITIONS.join(", ") },
        { status: 400 }
      );
    }

    const { data: slot, error } = await supabaseServer
      .from("team_slots")
      .insert([{ position, event_id: eventId }])
      .select()
      .single();

    if (error) {
      console.error("Error creating slot:", error);
      return NextResponse.json({ error: "Failed to create slot" }, { status: 500 });
    }

    return NextResponse.json({ success: true, slot });
  } catch (e: any) {
    console.error("Schedule slots POST:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
