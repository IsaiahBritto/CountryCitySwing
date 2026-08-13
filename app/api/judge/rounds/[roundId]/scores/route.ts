import { NextRequest, NextResponse } from "next/server";
import { requireJudgeAuth } from "@/lib/judgeAuth";
import {
  activeRoundEntries,
  loadRoundContext,
  RoundDataError,
  type RoundContext,
} from "@/lib/comps/roundData";
import { supabaseServer } from "@/lib/supabaseServer";
import type { CallbackValue } from "@/lib/comps/types";

const CALLBACK_VALUES: CallbackValue[] = ["yes", "alt1", "alt2", "alt3", "no"];

interface ResolvedJudge {
  ctx: RoundContext;
  assignmentId: string;
  actingUserId: string;
  isOverride: boolean;
}

async function resolveJudge(
  req: NextRequest,
  roundId: string,
  overrideId: string | null
): Promise<ResolvedJudge | NextResponse> {
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
      { error: "This sheet is submitted and locked. Ask the chief judge to unlock it." },
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

/**
 * PUT: silent autosave. Body: { scores: [{ round_entry_id, callback_value?,
 * ordinal?, raw_score? }], judge_assignment_id? (admin override) }
 * Upserts partial drafts without validation; validation happens at submit.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const body = await req.json();
  const resolved = await resolveJudge(
    req,
    roundId,
    body.judge_assignment_id ?? null
  );
  if (resolved instanceof NextResponse) return resolved;
  const { ctx, assignmentId, actingUserId, isOverride } = resolved;

  const scores: any[] = Array.isArray(body.scores) ? body.scores : [];
  if (scores.length === 0) {
    return NextResponse.json({ error: "No scores provided" }, { status: 400 });
  }

  const validEntryIds = new Set(ctx.roundEntries.map((re) => re.id));
  const rows: Record<string, unknown>[] = [];
  for (const s of scores) {
    if (!validEntryIds.has(s.round_entry_id)) continue;
    const row: Record<string, unknown> = {
      round_id: roundId,
      judge_assignment_id: assignmentId,
      round_entry_id: s.round_entry_id,
      entered_by: isOverride ? actingUserId : null,
      updated_at: new Date().toISOString(),
    };
    if (s.callback_value !== undefined) {
      row.callback_value =
        s.callback_value && CALLBACK_VALUES.includes(s.callback_value)
          ? s.callback_value
          : null;
    }
    if (s.ordinal !== undefined) {
      row.ordinal =
        Number.isInteger(s.ordinal) && s.ordinal > 0 ? s.ordinal : null;
    }
    if (s.raw_score !== undefined) {
      const raw = Number(s.raw_score);
      row.raw_score =
        Number.isFinite(raw) && raw >= 0 && raw <= 100
          ? Math.round(raw * 10) / 10
          : null;
    }
    if (s.thumbs_up_count !== undefined) {
      const n = Number(s.thumbs_up_count);
      row.thumbs_up_count =
        Number.isInteger(n) && n >= 0 ? n : 0;
    }
    if (s.thumbs_down_count !== undefined) {
      const n = Number(s.thumbs_down_count);
      row.thumbs_down_count =
        Number.isInteger(n) && n >= 0 ? n : 0;
    }
    rows.push(row);
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid scores" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("comp_scores")
    .upsert(rows, { onConflict: "round_id,judge_assignment_id,round_entry_id" });
  if (error) {
    console.error("[judge/scores] autosave failed", error);
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }

  // Make sure a draft sheet row exists so the console can track progress.
  await supabaseServer
    .from("comp_judge_sheets")
    .upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: assignmentId,
          status: "draft",
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id", ignoreDuplicates: true }
    );

  return NextResponse.json({ saved: rows.length });
}

/**
 * POST: submit (lock) the sheet after validating it is complete and legal.
 * Callback rounds: exactly the required number of Yes votes and distinct
 * ranked alternates. Finals: a complete, duplicate-free set of ordinals.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body allowed.
  }
  const resolved = await resolveJudge(
    req,
    roundId,
    body?.judge_assignment_id ?? null
  );
  if (resolved instanceof NextResponse) return resolved;
  const { ctx, assignmentId } = resolved;

  const active = activeRoundEntries(ctx);
  const activeIds = new Set(active.map((re) => re.id));
  const myScores = ctx.scores.filter(
    (s) => s.judge_assignment_id === assignmentId && activeIds.has(s.round_entry_id)
  );
  const byEntry = new Map(myScores.map((s) => [s.round_entry_id, s]));

  if (ctx.round.scoring_mode === "callback") {
    const callbackCount = Math.min(ctx.round.callback_count ?? 0, active.length);
    const alternateCount = Math.min(
      ctx.round.alternate_count ?? 0,
      Math.max(0, active.length - callbackCount)
    );
    let yes = 0;
    const altRanks = new Map<string, number>();
    let unknown = 0;
    for (const re of active) {
      const value = byEntry.get(re.id)?.callback_value;
      if (value == null) {
        unknown++;
        continue;
      }
      if (value === "yes") yes++;
      if (value === "alt1" || value === "alt2" || value === "alt3") {
        altRanks.set(value, (altRanks.get(value) ?? 0) + 1);
      }
    }
    if (unknown > 0) {
      return NextResponse.json(
        {
          error: `Every competitor must be marked Yes, alternate, or No (${unknown} unknown)`,
        },
        { status: 422 }
      );
    }
    if (yes !== callbackCount) {
      return NextResponse.json(
        { error: `You must give exactly ${callbackCount} Yes votes (currently ${yes})` },
        { status: 422 }
      );
    }
    const totalAlts = [...altRanks.values()].reduce((a, b) => a + b, 0);
    if (totalAlts !== alternateCount) {
      return NextResponse.json(
        {
          error: `You must mark exactly ${alternateCount} alternate${alternateCount === 1 ? "" : "s"} (currently ${totalAlts})`,
        },
        { status: 422 }
      );
    }
    for (const [rank, count] of altRanks) {
      if (count > 1) {
        return NextResponse.json(
          { error: `Alternate rank ${rank.replace("alt", "")} is used more than once` },
          { status: 422 }
        );
      }
    }
    for (let i = 1; i <= alternateCount; i++) {
      if (!altRanks.has(`alt${i}`)) {
        return NextResponse.json(
          { error: `Alternate ${i} has not been assigned` },
          { status: 422 }
        );
      }
    }
  } else {
    // Relative placement: complete 1..N ordinals, no duplicates.
    const seen = new Set<number>();
    for (const re of active) {
      const ord = byEntry.get(re.id)?.ordinal;
      if (ord == null) {
        return NextResponse.json(
          { error: "Every couple needs a placement before you can submit" },
          { status: 422 }
        );
      }
      if (ord < 1 || ord > active.length) {
        return NextResponse.json(
          { error: "Placements must run 1 through the number of couples" },
          { status: 422 }
        );
      }
      if (seen.has(ord)) {
        return NextResponse.json(
          { error: "Two couples share a placement; adjust before submitting (no ties allowed)" },
          { status: 422 }
        );
      }
      seen.add(ord);
    }
  }

  const { error } = await supabaseServer
    .from("comp_judge_sheets")
    .upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: assignmentId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id" }
    );
  if (error) {
    return NextResponse.json({ error: "Failed to submit sheet" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
