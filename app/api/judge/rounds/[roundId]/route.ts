import { NextRequest, NextResponse } from "next/server";
import { requireJudgeAuth } from "@/lib/judgeAuth";
import { loadRoundContext, RoundDataError } from "@/lib/comps/roundData";
import {
  buildJudgeRoundViewPayload,
  JudgeRoundAccessError,
} from "@/lib/comps/judgeRoundPayload";
import { judgeScoresRound, siblingRoundFor } from "@/lib/comps/judgeScope";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * GET: scoring context for a judge device. Entries only populate once the
 * round is open (check-in complete). Admins may pass ?judge_assignment_id=
 * to load/enter scores on a judge's behalf.
 *
 * When the judge scores both roles, siblingContext includes the opposite
 * role's payload in the same response for instant client-side toggling.
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

  if (!judgeScoresRound(assignment, ctx.round)) {
    return NextResponse.json(
      { error: "Your assignment does not include this round" },
      { status: 403 }
    );
  }

  let primary;
  try {
    primary = await buildJudgeRoundViewPayload(roundId, assignment);
  } catch (err) {
    if (err instanceof JudgeRoundAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { data: compRounds } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role")
    .eq("competition_id", ctx.round.competition_id);
  const siblingRound = siblingRoundFor(compRounds ?? [], ctx.round);

  let siblingContext = null;
  if (assignment.scoring_scope === "both" && siblingRound) {
    try {
      siblingContext = await buildJudgeRoundViewPayload(
        siblingRound.id,
        assignment
      );
    } catch (err) {
      if (err instanceof JudgeRoundAccessError) {
        siblingContext = null;
      } else {
        throw err;
      }
    }
  }

  return NextResponse.json({
    ...primary,
    competition: {
      id: ctx.competition.id,
      name: ctx.competition.name,
      comp_type: ctx.competition.comp_type,
    },
    judgeAssignmentId: assignment.id,
    judgeRole: assignment.judge_role,
    scoringScope: assignment.scoring_scope,
    siblingRound,
    siblingContext,
  });
}
