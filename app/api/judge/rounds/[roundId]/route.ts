import { NextRequest, NextResponse } from "next/server";
import { requireJudgeAuth } from "@/lib/judgeAuth";
import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  RoundDataError,
} from "@/lib/comps/roundData";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * GET: scoring context for a judge device. Entries only populate once the
 * round is open (check-in complete). Admins may pass ?judge_assignment_id=
 * to load/enter scores on a judge's behalf.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;

  let ctx;
  try {
    ctx = await loadRoundContext(roundId);
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const auth = await requireJudgeAuth(req, {
    competitionId: ctx.round.competition_id,
  });
  if (!auth.ok) return auth.response;

  // Resolve which judge assignment this request acts as.
  const overrideId = req.nextUrl.searchParams.get("judge_assignment_id");
  let assignment = auth.assignments.find(
    (a) => a.competition_id === ctx.round.competition_id
  );
  if (overrideId && auth.isAdmin) {
    const target = ctx.judges.find((j) => j.id === overrideId);
    if (!target) {
      return NextResponse.json(
        { error: "Judge assignment not found" },
        { status: 404 }
      );
    }
    assignment = target;
  }
  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to judge this competition" },
      { status: 403 }
    );
  }

  const { data: heats } = await supabaseServer
    .from("comp_heats")
    .select("*")
    .eq("round_id", roundId)
    .order("heat_number");

  const showEntries = ["open", "closed"].includes(ctx.round.status);
  const active = showEntries ? activeRoundEntries(ctx) : [];
  const heatNumberById = new Map((heats ?? []).map((h) => [h.id, h.heat_number]));

  const sheet = ctx.sheets.find((s) => s.judge_assignment_id === assignment.id);
  const myScores = ctx.scores.filter(
    (s) => s.judge_assignment_id === assignment.id
  );

  const unresolvedCheckin = ctx.roundEntries.filter(
    (re) => !re.scratched && re.checkin_status === "pending"
  ).length;
  const presentCount = activeRoundEntries(ctx).length;

  return NextResponse.json({
    round: {
      id: ctx.round.id,
      competition_id: ctx.round.competition_id,
      round_type: ctx.round.round_type,
      judged_role: ctx.round.judged_role,
      scoring_mode: ctx.round.scoring_mode,
      callback_count: ctx.round.callback_count,
      alternate_count: ctx.round.alternate_count,
      status: ctx.round.status,
    },
    checkin: {
      unresolved: unresolvedCheckin,
      present: presentCount,
      complete: unresolvedCheckin === 0 && presentCount > 0,
    },
    competition: {
      id: ctx.competition.id,
      name: ctx.competition.name,
      comp_type: ctx.competition.comp_type,
    },
    judgeAssignmentId: assignment.id,
    judgeRole: assignment.judge_role,
    sheet: sheet
      ? { status: sheet.status, submitted_at: sheet.submitted_at }
      : { status: "draft", submitted_at: null },
    entries: active
      .map((re) => ({
        ...entryDisplay(re),
        heatNumber: re.heat_id ? heatNumberById.get(re.heat_id) ?? null : null,
        danceOrder: re.dance_order,
      }))
      .sort(
        (a, b) =>
          (a.heatNumber ?? 0) - (b.heatNumber ?? 0) ||
          (a.danceOrder ?? 0) - (b.danceOrder ?? 0) ||
          (a.bibNumber ?? 0) - (b.bibNumber ?? 0)
      ),
    scores: myScores.map((s) => ({
      round_entry_id: s.round_entry_id,
      callback_value: s.callback_value,
      ordinal: s.ordinal,
      raw_score: s.raw_score != null ? Number(s.raw_score) : null,
      updated_at: s.updated_at,
    })),
  });
}
