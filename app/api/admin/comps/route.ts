import { NextRequest, NextResponse } from "next/server";
import { loadOrganizedEventsForUser } from "@/lib/compEventAccess";
import { requireAuthenticatedProfile, isSiteAdmin } from "@/lib/nonCcsEventAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: list competitions (admin: all; organizer: owned approved events). */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;

  const eventId = req.nextUrl.searchParams.get("event_id");
  const admin = isSiteAdmin(auth.role);

  if (!admin) {
    const owned = await loadOrganizedEventsForUser(auth.userId);
    const approvedIds = new Set(
      owned.filter((e) => e.approval_status === "approved").map((e) => e.id)
    );
    if (approvedIds.size === 0) {
      return NextResponse.json({ competitions: [] });
    }
    let query = supabaseServer
      .from("competitions")
      .select(
        "*, event:events(id, title, starts_at, ends_at, time_zone, type, host_kind), entries:comp_entries(count), judges:comp_judge_assignments!comp_judge_assignments_competition_id_fkey(count), rounds:comp_rounds(count)"
      )
      .in("event_id", [...approvedIds])
      .order("created_at", { ascending: false });
    if (eventId) {
      if (!approvedIds.has(eventId)) {
        return NextResponse.json({ competitions: [] });
      }
      query = query.eq("event_id", eventId);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "Failed to load competitions" }, { status: 500 });
    }
    return NextResponse.json({ competitions: data ?? [] });
  }

  let query = supabaseServer
    .from("competitions")
    .select(
      "*, event:events(id, title, starts_at, ends_at, time_zone, type, host_kind), entries:comp_entries(count), judges:comp_judge_assignments!comp_judge_assignments_competition_id_fkey(count), rounds:comp_rounds(count)"
    )
    .order("created_at", { ascending: false });
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/comps] list failed", error);
    return NextResponse.json(
      { error: "Failed to load competitions" },
      { status: 500 }
    );
  }
  return NextResponse.json({ competitions: data ?? [] });
}

/** POST: create a competition (site admin only; organizers use non-CCS API). */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) return auth.response;
  if (!isSiteAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const eventId = body.event_id;
  const compType = body.comp_type;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!eventId || !name) {
    return NextResponse.json(
      { error: "event_id and name are required" },
      { status: 400 }
    );
  }
  if (
    compType !== "jack_and_jill" &&
    compType !== "strictly" &&
    compType !== "all_american"
  ) {
    return NextResponse.json(
      {
        error:
          "comp_type must be jack_and_jill, strictly, or all_american",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("competitions")
    .insert([
      {
        event_id: eventId,
        comp_type: compType,
        name,
        cj_in_panel: !!body.cj_in_panel,
        test_comp: body.test_comp === true,
      },
    ])
    .select("*")
    .single();

  if (error) {
    console.error("[admin/comps] create failed", error);
    return NextResponse.json(
      { error: "Failed to create competition" },
      { status: 500 }
    );
  }
  return NextResponse.json({ competition: data });
}
