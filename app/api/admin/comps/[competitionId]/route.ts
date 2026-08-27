import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { deleteCompetitionFully } from "@/lib/comps/deleteCompetition";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  isHeadJudgeLockedForRole,
  validateHeadJudgeAssignment,
} from "@/lib/comps/headJudgeValidation";
import type { CompetitionRow } from "@/lib/comps/types";

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
  if (body.max_floor_couples !== undefined) {
    const n = Number(body.max_floor_couples);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "max_floor_couples must be a positive number" },
        { status: 400 }
      );
    }
    update.max_floor_couples = Math.floor(n);
  }

  const headJudgeFields =
    body.lead_head_judge_assignment_id !== undefined ||
    body.follow_head_judge_assignment_id !== undefined;

  if (headJudgeFields) {
    const { data: competition } = await supabaseServer
      .from("competitions")
      .select("*")
      .eq("id", competitionId)
      .maybeSingle();
    if (!competition) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }
    if (competition.comp_type !== "jack_and_jill") {
      return NextResponse.json(
        { error: "Head judges are only supported for Jack & Jill competitions" },
        { status: 400 }
      );
    }

    const { data: judges } = await supabaseServer
      .from("comp_judge_assignments")
      .select("id, judge_role, scoring_scope")
      .eq("competition_id", competitionId);
    const { data: rounds } = await supabaseServer
      .from("comp_rounds")
      .select("round_type, judged_role, status")
      .eq("competition_id", competitionId);

    const judgeList = judges ?? [];
    const roundList = rounds ?? [];

    if (body.lead_head_judge_assignment_id !== undefined) {
      if (isHeadJudgeLockedForRole(roundList, "lead")) {
        return NextResponse.json(
          { error: "Lead head judge cannot be changed after lead callback scoring has opened" },
          { status: 409 }
        );
      }
      const leadId =
        body.lead_head_judge_assignment_id === null ||
        body.lead_head_judge_assignment_id === ""
          ? null
          : String(body.lead_head_judge_assignment_id);
      const err = validateHeadJudgeAssignment(
        competition as CompetitionRow,
        leadId,
        "lead",
        judgeList
      );
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      update.lead_head_judge_assignment_id = leadId;
    }

    if (body.follow_head_judge_assignment_id !== undefined) {
      if (isHeadJudgeLockedForRole(roundList, "follow")) {
        return NextResponse.json(
          { error: "Follow head judge cannot be changed after follow callback scoring has opened" },
          { status: 409 }
        );
      }
      const followId =
        body.follow_head_judge_assignment_id === null ||
        body.follow_head_judge_assignment_id === ""
          ? null
          : String(body.follow_head_judge_assignment_id);
      const err = validateHeadJudgeAssignment(
        competition as CompetitionRow,
        followId,
        "follow",
        judgeList
      );
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      update.follow_head_judge_assignment_id = followId;
    }
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

/** DELETE: permanently remove a competition and all related data. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  try {
    await deleteCompetitionFully(competitionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete competition";
    const status = message === "Competition not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: true });
}
