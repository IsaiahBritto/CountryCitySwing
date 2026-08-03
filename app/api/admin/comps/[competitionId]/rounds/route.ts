import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  findPreviousEnabledRound,
  isFirstEnabledSlot,
  isRoundFinalized,
  roundOrderForType,
  type RoundSlotRef,
} from "@/lib/comps/roundChain";
import {
  resolveEntryIdsForRound,
  seedRoundEntries,
  isJnJFinalsRound,
} from "@/lib/comps/roundSeed";
import type { RoundType } from "@/lib/comps/types";

async function loadCompetitionRounds(
  competitionId: string
): Promise<RoundSlotRef[]> {
  const { data } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role, status, round_order")
    .eq("competition_id", competitionId);
  return (data ?? []) as RoundSlotRef[];
}

/**
 * POST: enable or configure a fixed round slot and seed its entries.
 * Body: round_type, judged_role?, callback_count?, alternate_count?
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();

  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, comp_type, cj_in_panel")
    .eq("id", competitionId)
    .maybeSingle();
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  const roundType = body.round_type as RoundType;
  if (!["prelims", "quarterfinal", "semifinal", "final"].includes(roundType)) {
    return NextResponse.json({ error: "Invalid round_type" }, { status: 400 });
  }
  const scoringMode =
    roundType === "final" ? "relative_placement" : "callback";
  const judgedRole =
    body.judged_role === "lead" || body.judged_role === "follow"
      ? body.judged_role
      : null;
  if (
    competition.comp_type === "jack_and_jill" &&
    scoringMode === "callback" &&
    !judgedRole
  ) {
    return NextResponse.json(
      { error: "JnJ callback rounds require judged_role (lead or follow)" },
      { status: 400 }
    );
  }

  const callbackCount =
    scoringMode === "callback" ? Number(body.callback_count) || null : null;
  if (scoringMode === "callback" && (!callbackCount || callbackCount < 1)) {
    return NextResponse.json(
      { error: "Callback rounds require callback_count" },
      { status: 400 }
    );
  }
  const alternateCount = Math.min(
    3,
    Math.max(0, Number(body.alternate_count) || 0)
  );

  const allRounds = await loadCompetitionRounds(competitionId);

  let existingQuery = supabaseServer
    .from("comp_rounds")
    .select("*")
    .eq("competition_id", competitionId)
    .eq("round_type", roundType);
  if (judgedRole) {
    existingQuery = existingQuery.eq("judged_role", judgedRole);
  } else {
    existingQuery = existingQuery.is("judged_role", null);
  }
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing && existing.status !== "pending") {
    return NextResponse.json(
      {
        error:
          "This round has already started. Only pending slots can be reconfigured.",
      },
      { status: 409 }
    );
  }

  const prev = findPreviousEnabledRound(allRounds, roundType, judgedRole);
  const deferJnJFinalsSeed = isJnJFinalsRound(
    competition.comp_type,
    roundType,
    judgedRole
  );
  const canSeedNow =
    !deferJnJFinalsSeed &&
    (isFirstEnabledSlot(allRounds, roundType) ||
      (prev != null && isRoundFinalized(prev.status)));

  let sourceRoundId: string | null = null;
  let entryIds: string[] = [];

  if (canSeedNow) {
    const resolved = await resolveEntryIdsForRound(
      competitionId,
      competition.comp_type,
      roundType,
      judgedRole,
      allRounds
    );
    entryIds = resolved.entryIds;
    sourceRoundId = resolved.sourceRoundId;

    if (!isFirstEnabledSlot(allRounds, roundType) && entryIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "The previous round has no advancers yet. Finalize it before enabling this round.",
        },
        { status: 409 }
      );
    }
    if (isFirstEnabledSlot(allRounds, roundType) && entryIds.length === 0) {
      return NextResponse.json(
        { error: "No matching entries to seed this round" },
        { status: 409 }
      );
    }
  } else if (prev) {
    sourceRoundId = prev.id;
  }

  const roundPayload = {
    competition_id: competitionId,
    round_type: roundType,
    judged_role: judgedRole,
    scoring_mode: scoringMode,
    callback_count: callbackCount,
    alternate_count: alternateCount,
    round_order: roundOrderForType(roundType),
    source_round_id: sourceRoundId,
    updated_at: new Date().toISOString(),
  };

  let round;
  if (existing) {
    const { data, error } = await supabaseServer
      .from("comp_rounds")
      .update(roundPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: "Failed to update round" }, { status: 500 });
    }
    round = data;
  } else {
    const { data, error } = await supabaseServer
      .from("comp_rounds")
      .insert([{ ...roundPayload, status: "pending" }])
      .select("*")
      .single();
    if (error) {
      console.error("[admin/comps/rounds] upsert failed", error);
      return NextResponse.json({ error: "Failed to enable round" }, { status: 500 });
    }
    round = data;
  }

  if (canSeedNow && entryIds.length > 0) {
    try {
      await seedRoundEntries(round.id, entryIds);
    } catch {
      if (!existing) {
        await supabaseServer.from("comp_rounds").delete().eq("id", round.id);
      }
      return NextResponse.json(
        { error: "Failed to seed round entries" },
        { status: 500 }
      );
    }
  }

  const { data: judges } = await supabaseServer
    .from("comp_judge_assignments")
    .select("judge_role")
    .eq("competition_id", competitionId);
  const panelSize = (judges ?? []).filter(
    (j) => j.judge_role === "judge" || competition.cj_in_panel
  ).length;
  const warning =
    panelSize > 0 && panelSize % 2 === 0
      ? `The judging panel currently has an even number of judges (${panelSize}); ties are more likely and the chief judge tie-break becomes essential.`
      : null;

  return NextResponse.json({
    round,
    seeded: canSeedNow ? entryIds.length : 0,
    waitingForPriorRound: !canSeedNow,
    warning,
  });
}

/**
 * DELETE: disable a pending slot (?round_type=&judged_role=).
 * Only allowed when the round is pending and has no scores.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const roundType = req.nextUrl.searchParams.get("round_type");
  const judgedRole = req.nextUrl.searchParams.get("judged_role");
  if (!roundType) {
    return NextResponse.json({ error: "round_type is required" }, { status: 400 });
  }

  let query = supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("competition_id", competitionId)
    .eq("round_type", roundType);
  if (judgedRole === "lead" || judgedRole === "follow") {
    query = query.eq("judged_role", judgedRole);
  } else {
    query = query.is("judged_role", null);
  }
  const { data: round } = await query.maybeSingle();
  if (!round) {
    return NextResponse.json({ error: "Round slot not found" }, { status: 404 });
  }
  if (round.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending slots can be disabled" },
      { status: 409 }
    );
  }

  const { data: scored } = await supabaseServer
    .from("comp_scores")
    .select("id")
    .eq("round_id", round.id)
    .limit(1);
  if ((scored ?? []).length > 0) {
    return NextResponse.json(
      { error: "This round has scores and cannot be disabled" },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("comp_rounds")
    .delete()
    .eq("id", round.id);
  if (error) {
    return NextResponse.json({ error: "Failed to disable round" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
