/**
 * Callback ("Yes / Alternate / No") scoring for prelims, quarters, and semis.
 *
 * Judges give exactly `callbackCount` Yes votes and up to three ranked
 * alternates. Votes are weighted (Yes = 10, Alt1 = 4.5, Alt2 = 4.3,
 * Alt3 = 4.2), summed, and ranked. Ties at the advance or alternate
 * boundary resolve in order: (1) manual coordinator/CJ decision,
 * (2) head judge callback vote weights (when configured),
 * (3) chief judge callback vote weights (fallback when HJ configured, or
 *     primary when no HJ),
 * (4) unresolved for manual UI.
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

export const HJ_TIE_BREAK_NOTE = "Tie broken by head judge's vote";
export const CJ_TIE_BREAK_NOTE = "Tie broken by chief judge's vote";
export const CJ_FALLBACK_TIE_BREAK_NOTE =
  "Tie broken by chief judge's vote (fallback)";

export interface CallbackInput {
  judgeIds: JudgeId[];
  entryIds: EntryId[];
  /** votes[judgeId][entryId]; missing votes count as "no". */
  votes: Record<JudgeId, Record<EntryId, CallbackValue | undefined>>;
  /** How many entries advance to the next round. */
  callbackCount: number;
  /** How many non-advancing entries are designated ranked alternates. */
  alternateCount: number;
  /** Head judge callback votes (primary tie-break when configured). */
  headJudgeVotes?: Record<EntryId, CallbackValue | undefined>;
  /**
   * Chief judge callback votes (fallback after HJ, or primary when no HJ).
   * Excluded from panel point math when cj_in_panel is false.
   */
  chiefJudgeVotes?: Record<EntryId, CallbackValue | undefined>;
  /**
   * Explicit orderings (best first) recorded by the coordinator/chief judge
   * for groups of entries whose points tied across a boundary.
   */
  manualTieResolutions?: EntryId[][];
  /** Parallel to manualTieResolutions — admin attested CJ scores were used. */
  manualTieUsedCjScores?: boolean[];
}

export interface CallbackRanked {
  entryId: EntryId;
  points: number;
  rank: number;
  advanced: boolean;
  /** 1-based alternate order for the first `alternateCount` non-advancers. */
  alternateRank: number | null;
  resolvedByDecision: boolean;
  resolvedByDecisionWithCjScores: boolean;
  resolvedByHeadJudge: boolean;
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

function tieBreakWeight(
  tieBreakVotes: Record<EntryId, CallbackValue | undefined>,
  entryId: EntryId
): number {
  const vote = tieBreakVotes[entryId];
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

export interface TieBreakGroupResolution {
  ordered: EntryId[];
  /** Subgroups still tied after tie-break ordering (need manual resolution). */
  unresolvedSubgroups: EntryId[][];
}

/**
 * Order a tied group by tie-break vote weight. Returns null when votes
 * are incomplete, or when the entire group shares one weight and still
 * spans a boundary.
 */
export function orderGroupByTieBreakVotes(
  group: EntryId[],
  startRank: number,
  callbackCount: number,
  alternateCount: number,
  tieBreakVotes: Record<EntryId, CallbackValue | undefined>
): TieBreakGroupResolution | null {
  if (!group.every((e) => tieBreakVotes[e] != null)) {
    return null;
  }

  const sorted = [...group].sort((a, b) => {
    const wa = tieBreakWeight(tieBreakVotes, a);
    const wb = tieBreakWeight(tieBreakVotes, b);
    if (wb !== wa) return wb - wa;
    return a.localeCompare(b);
  });

  const unresolvedSubgroups: EntryId[][] = [];
  let i = 0;
  while (i < sorted.length) {
    const weight = tieBreakWeight(tieBreakVotes, sorted[i]);
    let j = i + 1;
    while (j < sorted.length && tieBreakWeight(tieBreakVotes, sorted[j]) === weight) {
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
      unresolvedSubgroups.push(run);
    }
    i = j;
  }

  if (
    unresolvedSubgroups.length === 1 &&
    unresolvedSubgroups[0].length === group.length
  ) {
    return null;
  }

  return { ordered: sorted, unresolvedSubgroups };
}

/** @deprecated Use orderGroupByTieBreakVotes */
export function orderGroupByChiefJudgeVotes(
  group: EntryId[],
  startRank: number,
  callbackCount: number,
  alternateCount: number,
  cjVotes: Record<EntryId, CallbackValue | undefined>
): TieBreakGroupResolution | null {
  return orderGroupByTieBreakVotes(
    group,
    startRank,
    callbackCount,
    alternateCount,
    cjVotes
  );
}

interface GroupResolutionResult {
  orderedGroup: EntryId[];
  resolvedByDecision: boolean;
  resolvedByDecisionWithCjScores: boolean;
  hjResolvedEntries: Set<EntryId>;
  cjResolvedEntries: Set<EntryId>;
  newUnresolved: CallbackUnresolvedTie[];
}

function resolveBoundaryGroup(
  group: EntryId[],
  start: number,
  p: number,
  callbackCount: number,
  alternateCount: number,
  crossesAdvance: boolean,
  crossesAlternate: boolean,
  withinAlternateZone: boolean,
  findManualResolution: (group: EntryId[]) => {
    ordered: EntryId[];
    usedCjScores: boolean;
  } | null,
  headJudgeVotes: Record<EntryId, CallbackValue | undefined> | undefined,
  chiefJudgeVotes: Record<EntryId, CallbackValue | undefined> | undefined,
  hasHeadJudge: boolean
): GroupResolutionResult {
  const empty: GroupResolutionResult = {
    orderedGroup: group,
    resolvedByDecision: false,
    resolvedByDecisionWithCjScores: false,
    hjResolvedEntries: new Set(),
    cjResolvedEntries: new Set(),
    newUnresolved: [],
  };

  if (
    group.length <= 1 ||
    !(crossesAdvance || crossesAlternate || withinAlternateZone)
  ) {
    return empty;
  }

  const manual = findManualResolution(group);
  if (manual) {
    return {
      ...empty,
      orderedGroup: manual.ordered,
      resolvedByDecision: true,
      resolvedByDecisionWithCjScores: manual.usedCjScores,
    };
  }

  const applyTieBreak = (
    votes: Record<EntryId, CallbackValue | undefined> | undefined,
    targetSet: Set<EntryId>,
    currentGroup: EntryId[]
  ): {
    ordered: EntryId[];
    unresolvedSubgroups: EntryId[][];
  } | null => {
    if (!votes) return null;
    const result = orderGroupByTieBreakVotes(
      currentGroup,
      start,
      callbackCount,
      alternateCount,
      votes
    );
    if (!result) return null;

    const stillTied = new Set(result.unresolvedSubgroups.flat());
    for (const entryId of currentGroup) {
      if (!stillTied.has(entryId)) {
        targetSet.add(entryId);
      }
    }
    return result;
  };

  const hjResolvedEntries = new Set<EntryId>();
  const cjResolvedEntries = new Set<EntryId>();
  const newUnresolved: CallbackUnresolvedTie[] = [];

  if (hasHeadJudge && headJudgeVotes) {
    const hjResult = applyTieBreak(headJudgeVotes, hjResolvedEntries, group);
    if (hjResult) {
      for (const subgroup of hjResult.unresolvedSubgroups) {
        if (chiefJudgeVotes) {
          const subStart = start + hjResult.ordered.indexOf(subgroup[0]);
          const cjResult = orderGroupByTieBreakVotes(
            subgroup,
            subStart,
            callbackCount,
            alternateCount,
            chiefJudgeVotes
          );
          if (cjResult) {
            const stillTied = new Set(cjResult.unresolvedSubgroups.flat());
            for (const entryId of subgroup) {
              if (!stillTied.has(entryId)) {
                cjResolvedEntries.add(entryId);
              }
            }
            for (const sub of cjResult.unresolvedSubgroups) {
              const subSubStart = subStart + cjResult.ordered.indexOf(sub[0]);
              const subSubStop = subSubStart + sub.length;
              const { crossesAdvance: ca } = groupCrossesBoundary(
                subSubStart,
                subSubStop,
                callbackCount,
                alternateCount
              );
              newUnresolved.push({
                entryIds: [...sub],
                points: p,
                boundary: ca ? "advance" : "alternate",
              });
            }
          } else {
            const subStart = start + hjResult.ordered.indexOf(subgroup[0]);
            const subStop = subStart + subgroup.length;
            const { crossesAdvance: ca } = groupCrossesBoundary(
              subStart,
              subStop,
              callbackCount,
              alternateCount
            );
            newUnresolved.push({
              entryIds: [...subgroup],
              points: p,
              boundary: ca ? "advance" : "alternate",
            });
          }
        } else {
          const subStart = start + hjResult.ordered.indexOf(subgroup[0]);
          const subStop = subStart + subgroup.length;
          const { crossesAdvance: ca } = groupCrossesBoundary(
            subStart,
            subStop,
            callbackCount,
            alternateCount
          );
          newUnresolved.push({
            entryIds: [...subgroup],
            points: p,
            boundary: ca ? "advance" : "alternate",
          });
        }
      }
      return {
        orderedGroup: hjResult.ordered,
        resolvedByDecision: false,
        resolvedByDecisionWithCjScores: false,
        hjResolvedEntries,
        cjResolvedEntries,
        newUnresolved,
      };
    }
    // HJ couldn't resolve — fall through to CJ on full group
  }

  if (chiefJudgeVotes) {
    const cjResult = applyTieBreak(chiefJudgeVotes, cjResolvedEntries, group);
    if (cjResult) {
      for (const subgroup of cjResult.unresolvedSubgroups) {
        const subStart = start + cjResult.ordered.indexOf(subgroup[0]);
        const subStop = subStart + subgroup.length;
        const { crossesAdvance: ca } = groupCrossesBoundary(
          subStart,
          subStop,
          callbackCount,
          alternateCount
        );
        newUnresolved.push({
          entryIds: [...subgroup],
          points: p,
          boundary: ca ? "advance" : "alternate",
        });
      }
      return {
        orderedGroup: cjResult.ordered,
        resolvedByDecision: false,
        resolvedByDecisionWithCjScores: false,
        hjResolvedEntries,
        cjResolvedEntries,
        newUnresolved,
      };
    }
  }

  newUnresolved.push({
    entryIds: [...group],
    points: p,
    boundary: crossesAdvance ? "advance" : "alternate",
  });
  return {
    orderedGroup: group,
    resolvedByDecision: false,
    resolvedByDecisionWithCjScores: false,
    hjResolvedEntries,
    cjResolvedEntries,
    newUnresolved,
  };
}

export function scoreCallbacks(input: CallbackInput): CallbackResult {
  const { judgeIds, entryIds, votes, callbackCount, alternateCount } = input;
  const manualResolutions = input.manualTieResolutions ?? [];
  const manualUsedCjScores = input.manualTieUsedCjScores ?? [];
  const headJudgeVotes = input.headJudgeVotes;
  const chiefJudgeVotes = input.chiefJudgeVotes;
  const hasHeadJudge = headJudgeVotes != null;

  const points = new Map<EntryId, number>();
  for (const entryId of entryIds) {
    let total = 0;
    for (const judgeId of judgeIds) {
      const vote = votes[judgeId]?.[entryId] ?? "no";
      total += CALLBACK_WEIGHTS[vote];
    }
    points.set(entryId, Math.round(total * 10) / 10);
  }

  const findManualResolution = (
    group: EntryId[]
  ): { ordered: EntryId[]; usedCjScores: boolean } | null => {
    const set = new Set(group);
    for (let i = 0; i < manualResolutions.length; i++) {
      const resolution = manualResolutions[i];
      if (
        resolution.length === group.length &&
        resolution.every((e) => set.has(e))
      ) {
        return {
          ordered: resolution,
          usedCjScores: manualUsedCjScores[i] === true,
        };
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
    resolvedByDecisionWithCjScores: boolean;
    resolvedByHeadJudge: boolean;
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

    const resolution = resolveBoundaryGroup(
      group,
      start,
      p,
      callbackCount,
      alternateCount,
      crossesAdvance,
      crossesAlternate,
      withinAlternateZone,
      findManualResolution,
      headJudgeVotes,
      chiefJudgeVotes,
      hasHeadJudge
    );

    unresolvedTies.push(...resolution.newUnresolved);

    for (const entryId of resolution.orderedGroup) {
      const resolvedByHeadJudge = resolution.hjResolvedEntries.has(entryId);
      const resolvedByChiefJudge = resolution.cjResolvedEntries.has(entryId);
      ordered.push({
        entryId,
        resolvedByDecision: resolution.resolvedByDecision,
        resolvedByDecisionWithCjScores:
          resolution.resolvedByDecisionWithCjScores,
        resolvedByHeadJudge,
        resolvedByChiefJudge,
      });
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
    let tieBreakNote: string | null = null;
    if (item.resolvedByHeadJudge) {
      tieBreakNote = HJ_TIE_BREAK_NOTE;
    } else if (item.resolvedByChiefJudge) {
      tieBreakNote = hasHeadJudge
        ? CJ_FALLBACK_TIE_BREAK_NOTE
        : CJ_TIE_BREAK_NOTE;
    }
    return {
      entryId: item.entryId,
      points: points.get(item.entryId)!,
      rank,
      advanced,
      alternateRank,
      resolvedByDecision: item.resolvedByDecision,
      resolvedByDecisionWithCjScores: item.resolvedByDecisionWithCjScores,
      resolvedByHeadJudge: item.resolvedByHeadJudge,
      resolvedByChiefJudge: item.resolvedByChiefJudge,
      tieBreakNote,
    };
  });

  return { ranked, unresolvedTies };
}
