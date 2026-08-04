import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: list competitions (optionally by event) with event info and counts. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  const eventId = req.nextUrl.searchParams.get("event_id");

  let query = supabaseServer
    .from("competitions")
    .select(
      "*, event:events(id, title, starts_at), entries:comp_entries(count), judges:comp_judge_assignments(count), rounds:comp_rounds(count)"
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

/** POST: create a competition (division) for a comp event. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

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
  if (compType !== "jack_and_jill" && compType !== "strictly") {
    return NextResponse.json(
      { error: "comp_type must be jack_and_jill or strictly" },
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
