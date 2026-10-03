import { NextRequest, NextResponse } from "next/server";
import { requireJudgeAuth } from "@/lib/judgeAuth";
import {
  loadRoundContext,
  RoundDataError,
  type RoundContext,
} from "@/lib/comps/roundData";

export interface ResolvedJudgeRound {
  ctx: RoundContext;
  assignmentId: string;
  actingUserId: string;
  isOverride: boolean;
}

/** Auth + assignment resolution for judge scoring routes on an open round. */
export async function resolveJudgeRound(
  req: NextRequest,
  roundId: string,
  overrideId: string | null
): Promise<ResolvedJudgeRound | NextResponse> {
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

  let assignment = auth.assignments.find(
    (a) => a.competition_id === ctx.round.competition_id
  );
  let isOverride = false;
  if (overrideId && auth.isAdmin && overrideId !== assignment?.id) {
    const target = ctx.judges.find((j) => j.id === overrideId);
    if (!target) {
      return NextResponse.json(
        { error: "Judge assignment not found" },
        { status: 404 }
      );
    }
    assignment = target;
    isOverride = true;
  }
  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to judge this competition" },
      { status: 403 }
    );
  }

  if (ctx.round.status !== "open") {
    return NextResponse.json(
      { error: "Scoring is not open for this round" },
      { status: 409 }
    );
  }
  const sheet = ctx.sheets.find((s) => s.judge_assignment_id === assignment.id);
  if (sheet?.status === "submitted") {
    return NextResponse.json(
      {
        error:
          "This sheet is submitted and locked. Ask the chief judge to unlock it.",
      },
      { status: 409 }
    );
  }

  return {
    ctx,
    assignmentId: assignment.id,
    actingUserId: auth.userId,
    isOverride,
  };
}
