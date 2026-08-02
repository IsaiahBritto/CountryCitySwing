import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/** GET: full director-console detail for one competition. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const { data: competition, error } = await supabaseServer
    .from("competitions")
    .select("*, event:events(id, title, starts_at, location)")
    .eq("id", competitionId)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "Failed to load competition" },
      { status: 500 }
    );
  }
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  const [entriesRes, judgesRes, roundsRes] = await Promise.all([
    supabaseServer
      .from("comp_entries")
      .select(
        "*, lead_bib:comp_bibs!comp_entries_lead_bib_id_fkey(id, bib_number), follow_bib:comp_bibs!comp_entries_follow_bib_id_fkey(id, bib_number)"
      )
      .eq("competition_id", competitionId)
      .order("created_at", { ascending: true }),
    supabaseServer
      .from("comp_judge_assignments")
      .select("*, profile:profiles(id, first_name, last_name, email)")
      .eq("competition_id", competitionId),
    supabaseServer
      .from("comp_rounds")
      .select(
        "*, round_entries:comp_round_entries(*, entry:comp_entries(*, lead_bib:comp_bibs!comp_entries_lead_bib_id_fkey(bib_number), follow_bib:comp_bibs!comp_entries_follow_bib_id_fkey(bib_number)), heat:comp_heats(heat_number)), sheets:comp_judge_sheets(*), results:comp_round_results(*)"
      )
      .eq("competition_id", competitionId)
      .order("round_order", { ascending: true }),
  ]);

  if (entriesRes.error || judgesRes.error || roundsRes.error) {
    console.error(
      "[admin/comps] detail failed",
      entriesRes.error ?? judgesRes.error ?? roundsRes.error
    );
    return NextResponse.json(
      { error: "Failed to load competition detail" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    competition,
    entries: entriesRes.data ?? [],
    judges: judgesRes.data ?? [],
    rounds: roundsRes.data ?? [],
  });
}

/** PATCH: update name / status / cj_in_panel. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (["setup", "in_progress", "completed"].includes(body.status)) {
    update.status = body.status;
  }
  if (typeof body.cj_in_panel === "boolean") {
    update.cj_in_panel = body.cj_in_panel;
  }

  const { data, error } = await supabaseServer
    .from("competitions")
    .update(update)
    .eq("id", competitionId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "Failed to update competition" },
      { status: 500 }
    );
  }
  return NextResponse.json({ competition: data });
}

/** DELETE: remove a competition (cascades entries, rounds, scores). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, status")
    .eq("id", competitionId)
    .maybeSingle();
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  if (competition.status !== "setup") {
    return NextResponse.json(
      { error: "Only competitions still in setup can be deleted" },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("competitions")
    .delete()
    .eq("id", competitionId);
  if (error) {
    return NextResponse.json(
      { error: "Failed to delete competition" },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
