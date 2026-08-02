import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { isDirectTransition } from "@/lib/comps/roundState";
import { canOpenRound, type RoundSlotRef } from "@/lib/comps/roundChain";
import {
  resolveEntryIdsForRound,
  seedRoundEntries,
} from "@/lib/comps/roundSeed";
import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  panelJudges,
  chiefJudge,
  RoundDataError,
} from "@/lib/comps/roundData";
import type { RoundStatus } from "@/lib/comps/types";

/** GET: round detail for the director console (entries, judges, progress). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;

  try {
    const ctx = await loadRoundContext(roundId);
    const { data: heats } = await supabaseServer
      .from("comp_heats")
      .select("*")
      .eq("round_id", roundId)
      .order("heat_number");
    const { data: results } = await supabaseServer
      .from("comp_round_results")
      .select("*")
      .eq("round_id", roundId);

    const scoreCounts = new Map<string, number>();
    for (const score of ctx.scores) {
      if (score.callback_value != null || score.ordinal != null) {
        scoreCounts.set(
          score.judge_assignment_id,
          (scoreCounts.get(score.judge_assignment_id) ?? 0) + 1
        );
      }
    }
    const activeCount = activeRoundEntries(ctx).length;

    return NextResponse.json({
      round: ctx.round,
      competition: ctx.competition,
      heats: heats ?? [],
      results: results ?? [],
      entries: ctx.roundEntries.map((re) => ({
        ...re,
        display: entryDisplay(re),
      })),
      judges: ctx.judges.map((j) => {
        const sheet = ctx.sheets.find((s) => s.judge_assignment_id === j.id);
        return {
          ...j,
          isPanel: j.judge_role === "judge" || ctx.competition.cj_in_panel,
          sheetStatus: sheet?.status ?? "draft",
          submittedAt: sheet?.submitted_at ?? null,
          scored: scoreCounts.get(j.id) ?? 0,
          total: activeCount,
        };
      }),
    });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** PATCH: direct status transitions and round config updates. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;
  const body = await req.json();

  try {
    const ctx = await loadRoundContext(roundId);
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status) {
      const target = body.status as RoundStatus;
      if (!isDirectTransition(ctx.round.status, target)) {
        return NextResponse.json(
          { error: `Cannot move round from ${ctx.round.status} to ${target}` },
          { status: 409 }
        );
      }
      if (target === "checkin") {
        const { data: allRoundsData } = await supabaseServer
          .from("comp_rounds")
          .select("id, round_type, judged_role, status, round_order")
          .eq("competition_id", ctx.competition.id);
        const allRounds = (allRoundsData ?? []) as RoundSlotRef[];
        const gate = canOpenRound(allRounds, ctx.round);
        if (!gate.ok) {
          return NextResponse.json({ error: gate.reason }, { status: 409 });
        }
        if (ctx.roundEntries.length === 0) {
          const { entryIds, sourceRoundId } = await resolveEntryIdsForRound(
            ctx.competition.id,
            ctx.competition.comp_type,
            ctx.round.round_type,
            ctx.round.judged_role,
            allRounds
          );
          if (entryIds.length === 0) {
            return NextResponse.json(
              {
                error:
                  "No entries seeded for this round. Finalize the previous round or re-save slot configuration.",
              },
              { status: 409 }
            );
          }
          await seedRoundEntries(roundId, entryIds);
          if (sourceRoundId) {
            update.source_round_id = sourceRoundId;
          }
        }
      }
      if (target === "open") {
        // Check-in gate: every non-scratched entry must be resolved, at
        // least one present, and the panel must exist before judges score.
        const unresolved = ctx.roundEntries.filter(
          (re) => !re.scratched && re.checkin_status === "pending"
        );
        if (unresolved.length > 0) {
          return NextResponse.json(
            {
              error: `Check-in incomplete: ${unresolved.length} entr${unresolved.length === 1 ? "y" : "ies"} unresolved`,
            },
            { status: 409 }
          );
        }
        if (activeRoundEntries(ctx).length === 0) {
          return NextResponse.json(
            { error: "No checked-in entries; cannot open scoring" },
            { status: 409 }
          );
        }
        const panel = panelJudges(ctx);
        if (panel.length === 0) {
          return NextResponse.json(
            { error: "Assign judges before opening scoring" },
            { status: 409 }
          );
        }
        // Create sheets for the panel and the chief judge.
        const cj = chiefJudge(ctx);
        const sheetJudges = [...panel];
        if (cj && !sheetJudges.some((j) => j.id === cj.id)) sheetJudges.push(cj);
        const existing = new Set(ctx.sheets.map((s) => s.judge_assignment_id));
        const newSheets = sheetJudges
          .filter((j) => !existing.has(j.id))
          .map((j) => ({ round_id: roundId, judge_assignment_id: j.id }));
        if (newSheets.length > 0) {
          const { error } = await supabaseServer
            .from("comp_judge_sheets")
            .insert(newSheets);
          if (error) {
            return NextResponse.json(
              { error: "Failed to create judge sheets" },
              { status: 500 }
            );
          }
        }
        // Mark the competition in progress on first opened round.
        await supabaseServer
          .from("competitions")
          .update({ status: "in_progress", updated_at: new Date().toISOString() })
          .eq("id", ctx.competition.id)
          .eq("status", "setup");
      }
      update.status = target;
    }

    if (ctx.round.status === "pending" || ctx.round.status === "checkin") {
      if (body.callback_count !== undefined) {
        update.callback_count = Number(body.callback_count) || null;
      }
      if (body.alternate_count !== undefined) {
        update.alternate_count = Math.min(
          3,
          Math.max(0, Number(body.alternate_count) || 0)
        );
      }
    }

    const { data, error } = await supabaseServer
      .from("comp_rounds")
      .update(update)
      .eq("id", roundId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: "Failed to update round" }, { status: 500 });
    }
    return NextResponse.json({ round: data });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** DELETE: remove a round that has not been scored. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;

  const { data: scored } = await supabaseServer
    .from("comp_scores")
    .select("id")
    .eq("round_id", roundId)
    .limit(1);
  if ((scored ?? []).length > 0) {
    return NextResponse.json(
      { error: "This round already has scores and cannot be deleted" },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("comp_rounds")
    .delete()
    .eq("id", roundId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete round" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
