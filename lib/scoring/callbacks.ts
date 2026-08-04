/**
 * Callback ("Yes / Alternate / No") scoring for prelims, quarters, and semis.
 *
 * Judges give exactly `callbackCount` Yes votes and up to three ranked
 * alternates. Votes are weighted (Yes = 10, Alt1 = 4.5, Alt2 = 4.3,
 * Alt3 = 4.2), summed, and ranked. Ties at the advance or alternate
 * boundary resolve in order: (1) manual coordinator/CJ decision,
 * (2) chief judge callback vote weights, (3) unresolved for manual UI.
 *
 * Pure functions, no I/O.
 */

export type EntryId = string;
export type JudgeId = string;

export type CallbackValue = "yes" | "alt1" | "alt2" | "alt3" | "no";

export const CALLBACK_WEIGHTS: Record<CallbackValue, number> = {
  yes: 10,
  alt1: 4.5,
  alt2: 4.3,
  alt3: 4.2,
  no: 0,
};

export const CJ_TIE_BREAK_NOTE = "Tie broken by chief judge's vote";

export interface CallbackInput {
  judgeIds: JudgeId[];
  entryIds: EntryId[];
  /** votes[judgeId][entryId]; missing votes count as "no". */
  votes: Record<JudgeId, Record<EntryId, CallbackValue | undefined>>;
  /** How many entries advance to the next round. */
  callbackCount: number;
  /** How many non-advancing entries are designated ranked alternates. */
  alternateCount: number;
  /**
   * Chief judge callback votes (tie-break only; excluded from panel point math
   * when cj_in_panel is false, but always used to break boundary ties).
   */
  chiefJudgeVotes?: Record<EntryId, CallbackValue | undefined>;
  /**
   * Explicit orderings (best first) recorded by the coordinator/chief judge
   * for groups of entries whose points tied across a boundary.
   */
  manualTieResolutions?: EntryId[][];
}

export interface CallbackRanked {
  entryId: EntryId;
  points: number;
  rank: number;
  advanced: boolean;
  /** 1-based alternate order for the first `alternateCount` non-advancers. */
  alternateRank: number | null;
  resolvedByDecision: boolean;
  resolvedByChiefJudge: boolean;
  tieBreakNote: string | null;
}

export interface CallbackUnresolvedTie {
  entryIds: EntryId[];
  points: number;
  boundary: "advance" | "alternate";
}

export interface CallbackResult {
  ranked: CallbackRanked[];
  /** Non-empty when the round cannot be finalized without a CJ decision. */
  unresolvedTies: CallbackUnresolvedTie[];
}

function cjWeight(
  cjVotes: Record<EntryId, CallbackValue | undefined>,
  entryId: EntryId
): number {
  const vote = cjVotes[entryId];
  if (vote == null) return NaN;
  return CALLBACK_WEIGHTS[vote];
}

function groupCrossesBoundary(
  startRank: number,
  stopRank: number,
  callbackCount: number,
  alternateCount: number
): {
  crossesAdvance: boolean;
  crossesAlternate: boolean;
  withinAlternateZone: boolean;
} {
  const crossesAdvance = startRank < callbackCount && stopRank > callbackCount;
  const alternateBoundary = callbackCount + alternateCount;
  const crossesAlternate =
    startRank < alternateBoundary && stopRank > alternateBoundary;
  const withinAlternateZone =
    alternateCount > 0 &&
    startRank >= callbackCount &&
    stopRank <= alternateBoundary;
  return { crossesAdvance, crossesAlternate, withinAlternateZone };
}

function needsBoundaryResolution(
  groupLength: number,
  startRank: number,
  stopRank: number,
  callbackCount: number,
  alternateCount: number
): boolean {
  if (groupLength <= 1) return false;
  const { crossesAdvance, crossesAlternate, withinAlternateZone } =
    groupCrossesBoundary(startRank, stopRank, callbackCount, alternateCount);
  return crossesAdvance || crossesAlternate || withinAlternateZone;
}

/**
 * Order a tied group by chief judge vote weight. Returns null when CJ votes
 * are incomplete or equal-weight runs still span a boundary.
 */
export function orderGroupByChiefJudgeVotes(
  group: EntryId[],
  startRank: number,
  callbackCount: number,
  alternateCount: number,
  cjVotes: Record<EntryId, CallbackValue | undefined>
): EntryId[] | null {
  if (!group.every((e) => cjVotes[e] != null)) {
    return null;
  }

  const sorted = [...group].sort((a, b) => {
    const wa = cjWeight(cjVotes, a);
    const wb = cjWeight(cjVotes, b);
    if (wb !== wa) return wb - wa;
    return a.localeCompare(b);
  });

  let i = 0;
  while (i < sorted.length) {
    const weight = cjWeight(cjVotes, sorted[i]);
    let j = i + 1;
    while (j < sorted.length && cjWeight(cjVotes, sorted[j]) === weight) {
      j++;
    }
    const run = sorted.slice(i, j);
    const runStart = startRank + i;
    const runStop = startRank + j;
    if (
      needsBoundaryResolution(
        run.length,
        runStart,
        runStop,
        callbackCount,
        alternateCount
      )
    ) {
      return null;
    }
    i = j;
  }

  return sorted;
}

export function scoreCallbacks(input: CallbackInput): CallbackResult {
  const { judgeIds, entryIds, votes, callbackCount, alternateCount } = input;
  const manualResolutions = input.manualTieResolutions ?? [];
  const cjVotes = input.chiefJudgeVotes;

  const points = new Map<EntryId, number>();
  for (const entryId of entryIds) {
    let total = 0;
    for (const judgeId of judgeIds) {
      const vote = votes[judgeId]?.[entryId] ?? "no";
      total += CALLBACK_WEIGHTS[vote];
    }
    points.set(entryId, Math.round(total * 10) / 10);
  }

  const findManualResolution = (group: EntryId[]): EntryId[] | null => {
    const set = new Set(group);
    for (const resolution of manualResolutions) {
      if (
        resolution.length === group.length &&
        resolution.every((e) => set.has(e))
      ) {
        return resolution;
      }
    }
    return null;
  };

  const byPoints = new Map<number, EntryId[]>();
  for (const entryId of entryIds) {
    const p = points.get(entryId)!;
    byPoints.set(p, [...(byPoints.get(p) ?? []), entryId]);
  }
  const sortedPoints = [...byPoints.keys()].sort((a, b) => b - a);

  const ordered: {
    entryId: EntryId;
    resolvedByDecision: boolean;
    resolvedByChiefJudge: boolean;
  }[] = [];
  const unresolvedTies: CallbackUnresolvedTie[] = [];

  let position = 0;
  for (const p of sortedPoints) {
    const group = byPoints.get(p)!;
    const start = position;
    const stop = position + group.length;
    const { crossesAdvance, crossesAlternate, withinAlternateZone } =
      groupCrossesBoundary(start, stop, callbackCount, alternateCount);

    let resolvedByDecision = false;
    let resolvedByChiefJudge = false;
    let orderedGroup = group;

    if (
      group.length > 1 &&
      (crossesAdvance || crossesAlternate || withinAlternateZone)
    ) {
      const manual = findManualResolution(group);
      if (manual) {
        orderedGroup = manual;
        resolvedByDecision = true;
      } else if (cjVotes) {
        const cjOrdered = orderGroupByChiefJudgeVotes(
          group,
          start,
          callbackCount,
          alternateCount,
          cjVotes
        );
        if (cjOrdered) {
          orderedGroup = cjOrdered;
          resolvedByChiefJudge = true;
        } else {
          unresolvedTies.push({
            entryIds: [...group],
            points: p,
            boundary: crossesAdvance ? "advance" : "alternate",
          });
        }
      } else {
        unresolvedTies.push({
          entryIds: [...group],
          points: p,
          boundary: crossesAdvance ? "advance" : "alternate",
        });
      }
    }

    for (const entryId of orderedGroup) {
      ordered.push({ entryId, resolvedByDecision, resolvedByChiefJudge });
    }
    position = stop;
  }

  const ranked: CallbackRanked[] = ordered.map((item, index) => {
    const rank = index + 1;
    const advanced = rank <= callbackCount;
    const alternateRank =
      !advanced && rank <= callbackCount + alternateCount
        ? rank - callbackCount
        : null;
    return {
      entryId: item.entryId,
      points: points.get(item.entryId)!,
      rank,
      advanced,
      alternateRank,
      resolvedByDecision: item.resolvedByDecision,
      resolvedByChiefJudge: item.resolvedByChiefJudge,
      tieBreakNote: item.resolvedByChiefJudge ? CJ_TIE_BREAK_NOTE : null,
    };
  });

  return { ranked, unresolvedTies };
}
