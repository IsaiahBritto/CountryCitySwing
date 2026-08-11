import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { buildSlotJudgeProgress } from "@/lib/comps/judgeProgress";
import { loadRoundContext, RoundDataError } from "@/lib/comps/roundData";
import type { RoundType } from "@/lib/comps/types";
import { supabaseServer } from "@/lib/supabaseServer";

const SLOT_TYPES: RoundType[] = [
  "prelims",
  "quarterfinal",
  "semifinal",
];

/** GET: slot-wide judge progress for JnJ lead/follow callback rounds. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const roundType = req.nextUrl.searchParams.get("round_type") as RoundType | null;

  if (!roundType || !SLOT_TYPES.includes(roundType)) {
    return NextResponse.json(
      { error: "round_type must be prelims, quarterfinal, or semifinal" },
      { status: 400 }
    );
  }

  const { data: competition, error: compError } = await supabaseServer
    .from("competitions")
    .select("id, comp_type, cj_in_panel, lead_head_judge_assignment_id, follow_head_judge_assignment_id")
    .eq("id", competitionId)
    .maybeSingle();

  if (compError) {
    return NextResponse.json(
      { error: "Failed to load competition" },
      { status: 500 }
    );
  }
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  if (competition.comp_type !== "jack_and_jill") {
    return NextResponse.json(
      { error: "Judge progress slot is only for Jack & Jill competitions" },
      { status: 400 }
    );
  }

  const { data: rounds, error: roundsError } = await supabaseServer
    .from("comp_rounds")
    .select("id, judged_role")
    .eq("competition_id", competitionId)
    .eq("round_type", roundType)
    .in("judged_role", ["lead", "follow"]);

  if (roundsError) {
    return NextResponse.json({ error: "Failed to load rounds" }, { status: 500 });
  }

  const leadRound = rounds?.find((r) => r.judged_role === "lead");
  const followRound = rounds?.find((r) => r.judged_role === "follow");

  if (!leadRound && !followRound) {
    return NextResponse.json({
      roundType,
      leadsRoundId: null,
      followsRoundId: null,
      judges: [],
      summary: {
        leadsPanelSubmitted: 0,
        leadsPanelTotal: 0,
        followsPanelSubmitted: 0,
        followsPanelTotal: 0,
        chiefJudgeComplete: true,
        leadHeadJudgeLabel: null,
        followHeadJudgeLabel: null,
      },
    });
  }

  try {
    const [leadCtx, followCtx] = await Promise.all([
      leadRound ? loadRoundContext(leadRound.id) : Promise.resolve(null),
      followRound ? loadRoundContext(followRound.id) : Promise.resolve(null),
    ]);

    const judges = leadCtx?.judges ?? followCtx?.judges ?? [];
    const result = buildSlotJudgeProgress(
      roundType,
      judges,
      leadCtx,
      followCtx,
      competition.cj_in_panel ?? false,
      competition.lead_head_judge_assignment_id ?? null,
      competition.follow_head_judge_assignment_id ?? null
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
