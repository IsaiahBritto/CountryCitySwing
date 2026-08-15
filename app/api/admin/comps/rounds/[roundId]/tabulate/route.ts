import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminOrChiefJudgeAuth } from "@/lib/judgeAuth";
import {
  adjustCallbackTabulation,
  removeTabulation,
  RoundDataError,
  tabulateRound,
} from "@/lib/comps/roundData";
import {
  clearPrizeAwardsForCompetition,
  isCoupleFinalsRound,
} from "@/lib/comps/prizeAwards";
import { reseedNextPendingSlots } from "@/lib/comps/roundSeed";
import type { RoundSlotRef } from "@/lib/comps/roundChain";

async function competitionIdForRound(roundId: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("comp_rounds")
    .select("competition_id")
    .eq("id", roundId)
    .maybeSingle();
  return data?.competition_id ?? null;
}

function parseTabulateBody(body: Record<string, unknown> | null) {
  let manualTieResolutions: string[][] = [];
  let manualTieUsedCjScores: boolean[] = [];
  let callbackCount: number | undefined;
  let alternateCount: number | undefined;
  let previewOnly = false;

  if (body) {
    if (Array.isArray(body.manual_tie_resolutions)) {
      manualTieResolutions = body.manual_tie_resolutions as string[][];
    }
    if (Array.isArray(body.manual_tie_used_cj_scores)) {
      manualTieUsedCjScores = body.manual_tie_used_cj_scores as boolean[];
    }
    if (body.callback_count != null) {
      callbackCount = Number(body.callback_count) || undefined;
    }
    if (body.alternate_count != null) {
      alternateCount = Math.min(
        3,
        Math.max(0, Number(body.alternate_count) || 0)
      );
    }
    previewOnly = body.preview_only === true;
  }

  return {
    manualTieResolutions,
    manualTieUsedCjScores,
    callbackCount,
    alternateCount,
    previewOnly,
  };
}

async function reseedAfterTabulation(competitionId: string, roundId: string) {
  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, comp_type")
    .eq("id", competitionId)
    .single();
  const { data: tabulatedRound } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role, status")
    .eq("id", roundId)
    .single();
  const { data: allRounds } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role, status, round_order")
    .eq("competition_id", competitionId);

  if (competition && tabulatedRound && allRounds) {
    await reseedNextPendingSlots(
      competitionId,
      competition.comp_type,
      tabulatedRound as RoundSlotRef,
      allRounds as RoundSlotRef[]
    );
  }
}

/**
 * POST: tabulate a closed round. Body may carry manual_tie_resolutions
 * (arrays of round-entry ids, best first) recorded from the verification
 * view. Responds 409 with unresolvedTies when a CJ decision is still needed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const competitionId = await competitionIdForRound(roundId);
  if (!competitionId) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, competitionId);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    // Empty body is fine.
  }
  const parsed = parseTabulateBody(body);

  try {
    const outcome = await tabulateRound(roundId, {
      manualTieResolutions: parsed.manualTieResolutions,
      manualTieUsedCjScores: parsed.manualTieUsedCjScores,
      callbackCount: parsed.callbackCount,
      alternateCount: parsed.alternateCount,
    });
    if (!outcome.ok) {
      return NextResponse.json(
        {
          error: "Ties need a coordinator/chief judge decision",
          unresolvedTies: outcome.unresolvedTies,
          previewTabulation: outcome.previewTabulation,
        },
        { status: 409 }
      );
    }

    await reseedAfterTabulation(competitionId, roundId);

    return NextResponse.json({ success: true, tabulation: outcome.tabulation });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/tabulate] failed", err);
    return NextResponse.json({ error: "Tabulation failed" }, { status: 500 });
  }
}

/**
 * PATCH: adjust call back / alternate cut lines on a tabulated callback round.
 * Body may include preview_only to recompute without persisting.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const competitionId = await competitionIdForRound(roundId);
  if (!competitionId) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, competitionId);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    // Empty body is fine.
  }
  const parsed = parseTabulateBody(body);

  try {
    const outcome = await adjustCallbackTabulation(roundId, {
      manualTieResolutions: parsed.manualTieResolutions,
      manualTieUsedCjScores: parsed.manualTieUsedCjScores,
      callbackCount: parsed.callbackCount,
      alternateCount: parsed.alternateCount,
      previewOnly: parsed.previewOnly,
    });

    if (parsed.previewOnly) {
      if (!outcome.ok) {
        return NextResponse.json(
          {
            error: "Ties need a coordinator/chief judge decision",
            unresolvedTies: outcome.unresolvedTies,
            previewTabulation: outcome.previewTabulation,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        previewTabulation: outcome.previewTabulation,
      });
    }

    if (!outcome.ok) {
      return NextResponse.json(
        {
          error: "Ties need a coordinator/chief judge decision",
          unresolvedTies: outcome.unresolvedTies,
          previewTabulation: outcome.previewTabulation,
        },
        { status: 409 }
      );
    }

    await reseedAfterTabulation(competitionId, roundId);

    return NextResponse.json({ success: true, tabulation: outcome.tabulation });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/tabulate] adjust failed", err);
    return NextResponse.json({ error: "Cut line adjustment failed" }, { status: 500 });
  }
}

/** DELETE: CJ steps the round back (removes tabulation, reverts to closed). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const competitionId = await competitionIdForRound(roundId);
  if (!competitionId) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, competitionId);
  if (!auth.ok) return auth.response;

  try {
    await removeTabulation(roundId);

    const { data: round } = await supabaseServer
      .from("comp_rounds")
      .select("round_type, judged_role")
      .eq("id", roundId)
      .maybeSingle();

    if (round && isCoupleFinalsRound(round)) {
      await clearPrizeAwardsForCompetition(competitionId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
