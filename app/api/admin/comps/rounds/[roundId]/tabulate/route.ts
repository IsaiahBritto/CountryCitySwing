import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminOrChiefJudgeAuth } from "@/lib/judgeAuth";
import {
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

  let manualTieResolutions: string[][] = [];
  let callbackCount: number | undefined;
  let alternateCount: number | undefined;
  try {
    const body = await req.json();
    if (Array.isArray(body?.manual_tie_resolutions)) {
      manualTieResolutions = body.manual_tie_resolutions;
    }
    if (body?.callback_count != null) {
      callbackCount = Number(body.callback_count) || undefined;
    }
    if (body?.alternate_count != null) {
      alternateCount = Math.min(3, Math.max(0, Number(body.alternate_count) || 0));
    }
  } catch {
    // Empty body is fine.
  }

  try {
    const outcome = await tabulateRound(roundId, {
      manualTieResolutions,
      callbackCount,
      alternateCount,
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

    return NextResponse.json({ success: true, tabulation: outcome.tabulation });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/tabulate] failed", err);
    return NextResponse.json({ error: "Tabulation failed" }, { status: 500 });
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
