import { NextRequest, NextResponse } from "next/server";
import { requireCompCheckinAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * POST: round check-in actions.
 * - { round_entry_id, checkin_status } marks an entry checked_in / absent /
 *   pending (the green check / red X screen).
 * - { action: "promote_alternate" } adds the next available alternate from
 *   the source round (in callback order) to this round.
 * - { round_entry_id, scratched } scratches/unscratches an entry.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const auth = await requireCompCheckinAuth(req, roundId);
  if (!auth.ok) return auth.response;
  const body = await req.json();

  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status, source_round_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (!["checkin", "open"].includes(round.status)) {
    return NextResponse.json(
      { error: `Check-in is not active for this round (status ${round.status})` },
      { status: 409 }
    );
  }

  if (body.action === "promote_alternate") {
    if (!round.source_round_id) {
      return NextResponse.json(
        { error: "This round has no source round to promote alternates from" },
        { status: 409 }
      );
    }
    const [{ data: alternates }, { data: existing }] = await Promise.all([
      supabaseServer
        .from("comp_round_results")
        .select("alternate_rank, round_entry:comp_round_entries(entry_id)")
        .eq("round_id", round.source_round_id)
        .not("alternate_rank", "is", null)
        .order("alternate_rank", { ascending: true }),
      supabaseServer
        .from("comp_round_entries")
        .select("entry_id")
        .eq("round_id", roundId),
    ]);
    const inRound = new Set((existing ?? []).map((e) => e.entry_id));
    const next = ((alternates ?? []) as any[]).find(
      (a) => a.round_entry?.entry_id && !inRound.has(a.round_entry.entry_id)
    );
    if (!next) {
      return NextResponse.json(
        { error: "No remaining alternates to promote" },
        { status: 409 }
      );
    }
    const { data: promoted, error } = await supabaseServer
      .from("comp_round_entries")
      .insert([
        {
          round_id: roundId,
          entry_id: next.round_entry.entry_id,
          promoted_alternate: true,
        },
      ])
      .select("*")
      .single();
    if (error) {
      return NextResponse.json(
        { error: "Failed to promote alternate" },
        { status: 500 }
      );
    }
    return NextResponse.json({ promoted });
  }

  const roundEntryId = body.round_entry_id;
  if (!roundEntryId) {
    return NextResponse.json(
      { error: "round_entry_id is required" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};
  if (["pending", "checked_in", "absent"].includes(body.checkin_status)) {
    update.checkin_status = body.checkin_status;
  }
  if (typeof body.scratched === "boolean") {
    update.scratched = body.scratched;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("comp_round_entries")
    .update(update)
    .eq("id", roundEntryId)
    .eq("round_id", roundId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "Failed to update check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({ roundEntry: data });
}
