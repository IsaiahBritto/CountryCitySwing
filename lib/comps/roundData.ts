import { supabaseServer } from "@/lib/supabaseServer";
import {
  compressOrdinals,
  tabulateRelativePlacement,
  RelativePlacementError,
} from "@/lib/scoring/relativePlacement";
import { scoreCallbacks, type CallbackValue } from "@/lib/scoring/callbacks";
import type {
  CompetitionRow,
  CompEntryRow,
  CompJudgeAssignmentRow,
  CompJudgeSheetRow,
  CompRoundEntryRow,
  CompRoundRow,
  CompScoreRow,
  EntryDisplay,
  RoundTabulation,
} from "@/lib/comps/types";

export interface JudgeWithProfile extends CompJudgeAssignmentRow {
  first_name: string;
  last_name: string;
  email: string | null;
}

export interface RoundEntryWithEntry extends CompRoundEntryRow {
  entry: CompEntryRow & {
    lead_bib: { bib_number: number } | null;
    follow_bib: { bib_number: number } | null;
  };
}

export interface RoundContext {
  round: CompRoundRow;
  competition: CompetitionRow;
  judges: JudgeWithProfile[];
  sheets: CompJudgeSheetRow[];
  roundEntries: RoundEntryWithEntry[];
  scores: CompScoreRow[];
}

export class RoundDataError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function loadRoundContext(roundId: string): Promise<RoundContext> {
  const { data: round, error: roundError } = await supabaseServer
    .from("comp_rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new RoundDataError("Failed to load round", 500);
  if (!round) throw new RoundDataError("Round not found", 404);

  const [competitionRes, judgesRes, sheetsRes, entriesRes, scoresRes] =
    await Promise.all([
      supabaseServer
        .from("competitions")
        .select("*")
        .eq("id", round.competition_id)
        .single(),
      supabaseServer
        .from("comp_judge_assignments")
        .select("*, profile:profiles(first_name, last_name, email)")
        .eq("competition_id", round.competition_id),
      supabaseServer.from("comp_judge_sheets").select("*").eq("round_id", roundId),
      supabaseServer
        .from("comp_round_entries")
        .select(
          "*, entry:comp_entries(*, lead_bib:comp_bibs!comp_entries_lead_bib_id_fkey(bib_number), follow_bib:comp_bibs!comp_entries_follow_bib_id_fkey(bib_number))"
        )
        .eq("round_id", roundId),
      supabaseServer.from("comp_scores").select("*").eq("round_id", roundId),
    ]);

  if (competitionRes.error || !competitionRes.data) {
    throw new RoundDataError("Failed to load competition", 500);
  }
  if (judgesRes.error || sheetsRes.error || entriesRes.error || scoresRes.error) {
    throw new RoundDataError("Failed to load round data", 500);
  }

  const judges: JudgeWithProfile[] = (judgesRes.data ?? []).map((row: any) => ({
    id: row.id,
    competition_id: row.competition_id,
    profile_id: row.profile_id,
    judge_role: row.judge_role,
    first_name: row.profile?.first_name ?? "",
    last_name: row.profile?.last_name ?? "",
    email: row.profile?.email ?? null,
  }));

  return {
    round: round as CompRoundRow,
    competition: competitionRes.data as CompetitionRow,
    judges,
    sheets: (sheetsRes.data ?? []) as CompJudgeSheetRow[],
    roundEntries: (entriesRes.data ?? []) as RoundEntryWithEntry[],
    scores: (scoresRes.data ?? []) as CompScoreRow[],
  };
}

function personName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown";
}

/** Judge-and-public-facing display for a round entry. */
export function entryDisplay(re: RoundEntryWithEntry): EntryDisplay {
  const e = re.entry;
  let displayName: string;
  let bibNumber: number | null;
  if (e.entry_kind === "couple") {
    displayName = `${personName(e.lead_first_name, e.lead_last_name)} & ${personName(e.follow_first_name, e.follow_last_name)}`;
    // Couples are judged off the leader's bib (Strictly and JnJ finals).
    bibNumber = e.lead_bib?.bib_number ?? null;
  } else if (e.role === "follow") {
    displayName = personName(e.follow_first_name, e.follow_last_name);
    bibNumber = e.follow_bib?.bib_number ?? null;
  } else {
    displayName = personName(e.lead_first_name, e.lead_last_name);
    bibNumber = e.lead_bib?.bib_number ?? null;
  }
  return {
    roundEntryId: re.id,
    entryId: re.entry_id,
    bibNumber,
    displayName,
    role: e.role,
  };
}

/** Entries that dance in this round: checked in and not scratched. */
export function activeRoundEntries(
  ctx: Pick<RoundContext, "roundEntries">
): RoundEntryWithEntry[] {
  return ctx.roundEntries.filter(
    (re) => !re.scratched && re.checkin_status === "checked_in"
  );
}

/**
 * Panel judges (participate in majority math). The chief judge joins the
 * panel only when the competition is configured with cj_in_panel.
 */
export function panelJudges(ctx: RoundContext): JudgeWithProfile[] {
  return ctx.judges.filter(
    (j) => j.judge_role === "judge" || ctx.competition.cj_in_panel
  );
}

export function chiefJudge(ctx: RoundContext): JudgeWithProfile | null {
  return ctx.judges.find((j) => j.judge_role === "chief_judge") ?? null;
}

export interface TabulateOutcome {
  ok: boolean;
  /** Present when a coordinator/CJ decision is required to finalize. */
  unresolvedTies?: {
    entryIds: string[];
    roundEntryIds: string[];
    displays: EntryDisplay[];
    reason: string;
    placements?: number[];
    points?: number;
  }[];
  tabulation?: RoundTabulation;
}

/**
 * Tabulates a closed round and persists results + the tabulation snapshot.
 * When ties need an external decision, nothing is persisted and the
 * unresolved groups are returned for the round-verification view.
 */
export async function tabulateRound(
  roundId: string,
  manualTieResolutions: string[][] = []
): Promise<TabulateOutcome> {
  const ctx = await loadRoundContext(roundId);
  const { round, competition } = ctx;

  if (round.status !== "closed") {
    throw new RoundDataError(
      `Round must be closed to tabulate (currently ${round.status})`,
      409
    );
  }

  const panel = panelJudges(ctx);
  if (panel.length === 0) {
    throw new RoundDataError("No judges assigned to this competition", 409);
  }

  const active = activeRoundEntries(ctx);
  if (active.length === 0) {
    throw new RoundDataError("No checked-in entries to tabulate", 409);
  }

  // Every panel judge must have a submitted sheet. (Replacing an unusable
  // sheet is done by unlocking/editing before tabulation.)
  const sheetsByJudge = new Map(
    ctx.sheets.map((s) => [s.judge_assignment_id, s])
  );
  const missing = panel.filter(
    (j) => sheetsByJudge.get(j.id)?.status !== "submitted"
  );
  if (missing.length > 0) {
    throw new RoundDataError(
      `Waiting on submitted sheets from: ${missing
        .map((j) => personName(j.first_name, j.last_name))
        .join(", ")}`,
      409
    );
  }

  const displays = new Map(active.map((re) => [re.id, entryDisplay(re)]));
  const judgeLabels = panel.map((j, i) => ({
    assignmentId: j.id,
    label: `J${i + 1}`,
    name: personName(j.first_name, j.last_name),
  }));

  const scoresByJudge = new Map<string, Map<string, CompScoreRow>>();
  for (const score of ctx.scores) {
    if (!scoresByJudge.has(score.judge_assignment_id)) {
      scoresByJudge.set(score.judge_assignment_id, new Map());
    }
    scoresByJudge.get(score.judge_assignment_id)!.set(score.round_entry_id, score);
  }

  if (round.scoring_mode === "callback") {
    return tabulateCallbackRound(ctx, {
      active,
      panel,
      displays,
      judgeLabels,
      scoresByJudge,
      manualTieResolutions,
    });
  }
  return tabulateRelativePlacementRound(ctx, {
    active,
    panel,
    displays,
    judgeLabels,
    scoresByJudge,
    manualTieResolutions,
  });
}

interface TabulateContext {
  active: RoundEntryWithEntry[];
  panel: JudgeWithProfile[];
  displays: Map<string, EntryDisplay>;
  judgeLabels: { assignmentId: string; label: string; name: string }[];
  scoresByJudge: Map<string, Map<string, CompScoreRow>>;
  manualTieResolutions: string[][];
}

async function tabulateCallbackRound(
  ctx: RoundContext,
  t: TabulateContext
): Promise<TabulateOutcome> {
  const { round } = ctx;
  const callbackCount = round.callback_count ?? 0;
  if (callbackCount <= 0) {
    throw new RoundDataError("Callback count is not configured for this round", 409);
  }

  const votes: Record<string, Record<string, CallbackValue | undefined>> = {};
  for (const judge of t.panel) {
    const judgeScores = t.scoresByJudge.get(judge.id);
    const sheet: Record<string, CallbackValue | undefined> = {};
    for (const re of t.active) {
      sheet[re.id] = (judgeScores?.get(re.id)?.callback_value ?? "no") as CallbackValue;
    }
    votes[judge.id] = sheet;
  }

  const result = scoreCallbacks({
    judgeIds: t.panel.map((j) => j.id),
    entryIds: t.active.map((re) => re.id),
    votes,
    callbackCount,
    alternateCount: round.alternate_count ?? 0,
    manualTieResolutions: t.manualTieResolutions,
  });

  if (result.unresolvedTies.length > 0) {
    return {
      ok: false,
      unresolvedTies: result.unresolvedTies.map((tie) => ({
        entryIds: tie.entryIds,
        roundEntryIds: tie.entryIds,
        displays: tie.entryIds.map((id) => t.displays.get(id)!),
        reason: `Tied at ${tie.points} points across the ${tie.boundary} boundary`,
        points: tie.points,
      })),
    };
  }

  const tabulation: RoundTabulation = {
    mode: "callback",
    judges: t.judgeLabels,
    callbackCount,
    alternateCount: round.alternate_count ?? 0,
    entries: t.active.map((re) => t.displays.get(re.id)!),
    ranked: result.ranked.map((r) => ({
      roundEntryId: r.entryId,
      points: r.points,
      rank: r.rank,
      advanced: r.advanced,
      alternateRank: r.alternateRank,
      resolvedByDecision: r.resolvedByDecision,
      votes: t.panel.map(
        (j) => (votes[j.id]?.[r.entryId] ?? "no") as CallbackValue
      ),
    })),
  };

  const resultRows = result.ranked.map((r) => ({
    round_id: round.id,
    round_entry_id: r.entryId,
    placement: r.rank,
    advanced: r.advanced,
    alternate_rank: r.alternateRank,
    callback_points: r.points,
    cj_decision: r.resolvedByDecision
      ? "Boundary tie resolved by coordinator/chief judge decision"
      : null,
  }));

  await persistTabulation(round.id, resultRows, tabulation);
  return { ok: true, tabulation };
}

async function tabulateRelativePlacementRound(
  ctx: RoundContext,
  t: TabulateContext
): Promise<TabulateOutcome> {
  const { round, competition } = ctx;
  const activeIds = t.active.map((re) => re.id);

  // Build each panel judge's ordinals over active entries; require complete,
  // duplicate-free sheets before compression (compression would mask errors).
  const rawOrdinals: Record<string, Record<string, number>> = {};
  for (const judge of t.panel) {
    const judgeScores = t.scoresByJudge.get(judge.id);
    const sheet: Record<string, number> = {};
    const seen = new Set<number>();
    for (const id of activeIds) {
      const ord = judgeScores?.get(id)?.ordinal;
      if (ord == null) {
        throw new RoundDataError(
          `${personName(judge.first_name, judge.last_name)} is missing a placement for ${t.displays.get(id)?.displayName ?? "an entry"}`,
          409
        );
      }
      if (seen.has(ord)) {
        throw new RoundDataError(
          `${personName(judge.first_name, judge.last_name)} has duplicate placements on their sheet`,
          409
        );
      }
      seen.add(ord);
      sheet[id] = ord;
    }
    rawOrdinals[judge.id] = sheet;
  }
  // Close any gaps left by scratched/absent entries.
  const ordinals = compressOrdinals(rawOrdinals, activeIds);

  // Chief judge tie-break sheet (only when the CJ is not part of the panel).
  const cj = chiefJudge(ctx);
  let chiefJudgeOrdinals: Record<string, number> | null = null;
  let cjLabel: { assignmentId: string; label: string; name: string } | null =
    null;
  if (cj && !competition.cj_in_panel) {
    const cjScores = t.scoresByJudge.get(cj.id);
    const sheet: Record<string, number> = {};
    let complete = true;
    for (const id of activeIds) {
      const ord = cjScores?.get(id)?.ordinal;
      if (ord == null) {
        complete = false;
        break;
      }
      sheet[id] = ord;
    }
    if (complete) {
      chiefJudgeOrdinals = compressOrdinals({ cj: sheet }, activeIds).cj;
      cjLabel = {
        assignmentId: cj.id,
        label: "CJ",
        name: personName(cj.first_name, cj.last_name),
      };
    }
  }

  let result;
  try {
    result = tabulateRelativePlacement({
      judgeIds: t.panel.map((j) => j.id),
      entryIds: activeIds,
      ordinals,
      chiefJudgeOrdinals,
      manualTieResolutions: t.manualTieResolutions,
    });
  } catch (err) {
    if (err instanceof RelativePlacementError) {
      throw new RoundDataError(err.message, 409);
    }
    throw err;
  }

  if (result.unresolvedTies.length > 0) {
    return {
      ok: false,
      unresolvedTies: result.unresolvedTies.map((tie) => ({
        entryIds: tie.entryIds,
        roundEntryIds: tie.entryIds,
        displays: tie.entryIds.map((id) => t.displays.get(id)!),
        reason:
          tie.reason === "head_to_head_cycle"
            ? "Head-to-head preference cycle; the panel cannot separate these entries"
            : "Judges split evenly head-to-head; the panel cannot separate these entries",
        placements: tie.placements,
      })),
    };
  }

  const gridByEntry = new Map(result.grid.map((g) => [g.entryId, g]));
  const tabulation: RoundTabulation = {
    mode: "relative_placement",
    judges: t.judgeLabels,
    chiefJudge: cjLabel,
    majority: result.majority,
    entries: t.active.map((re) => t.displays.get(re.id)!),
    grid: t.active.map((re) => {
      const g = gridByEntry.get(re.id)!;
      return {
        roundEntryId: re.id,
        ordinals: g.ordinals,
        cells: g.cells,
        placement: g.placement,
        decidedAtLevel: g.decidedAtLevel,
        tieBreakNote: g.tieBreakNote,
        chiefJudgeOrdinal: chiefJudgeOrdinals?.[re.id] ?? null,
      };
    }),
  };

  const resultRows = t.active.map((re) => {
    const g = gridByEntry.get(re.id)!;
    const externallyResolved =
      g.tieBreakNote != null &&
      (g.tieBreakNote.includes("chief judge") ||
        g.tieBreakNote.includes("decision"));
    return {
      round_id: round.id,
      round_entry_id: re.id,
      placement: g.placement,
      advanced: null,
      alternate_rank: null,
      callback_points: null,
      cj_decision: externallyResolved ? g.tieBreakNote : null,
    };
  });

  await persistTabulation(round.id, resultRows, tabulation);
  return { ok: true, tabulation };
}

async function persistTabulation(
  roundId: string,
  resultRows: Record<string, unknown>[],
  tabulation: RoundTabulation
) {
  const { error: deleteError } = await supabaseServer
    .from("comp_round_results")
    .delete()
    .eq("round_id", roundId);
  if (deleteError) {
    throw new RoundDataError("Failed to clear previous results", 500);
  }

  const { error: insertError } = await supabaseServer
    .from("comp_round_results")
    .insert(resultRows);
  if (insertError) {
    throw new RoundDataError("Failed to save results", 500);
  }

  const { error: updateError } = await supabaseServer
    .from("comp_rounds")
    .update({
      status: "tabulated",
      tabulation,
      tabulated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);
  if (updateError) {
    throw new RoundDataError("Failed to update round status", 500);
  }
}

/** CJ action: step a round back from tabulated to closed. */
export async function removeTabulation(roundId: string) {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) throw new RoundDataError("Round not found", 404);
  if (round.status !== "tabulated") {
    throw new RoundDataError(
      `Only tabulated rounds can have their tabulation removed (currently ${round.status})`,
      409
    );
  }

  const { error: deleteError } = await supabaseServer
    .from("comp_round_results")
    .delete()
    .eq("round_id", roundId);
  if (deleteError) throw new RoundDataError("Failed to remove results", 500);

  const { error: updateError } = await supabaseServer
    .from("comp_rounds")
    .update({
      status: "closed",
      tabulation: null,
      tabulated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);
  if (updateError) throw new RoundDataError("Failed to update round", 500);
}
