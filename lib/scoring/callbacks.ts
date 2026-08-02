/**
 * Callback ("Yes / Alternate / No") scoring for prelims, quarters, and semis.
 *
 * Judges give exactly `callbackCount` Yes votes and up to three ranked
 * alternates. Votes are weighted (Yes = 10, Alt1 = 4.5, Alt2 = 4.3,
 * Alt3 = 4.2), summed, and ranked. Ties the weights cannot break at the
 * advance or alternate boundary are reported as unresolved; the
 * coordinator/chief judge must resolve them in the round-verification view
 * (recorded as a manual resolution) before the round can be finalized.
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

export function scoreCallbacks(input: CallbackInput): CallbackResult {
  const { judgeIds, entryIds, votes, callbackCount, alternateCount } = input;
  const manualResolutions = input.manualTieResolutions ?? [];

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

  // Group by points descending; order within a tied group is undefined unless
  // a manual resolution covers it.
  const byPoints = new Map<number, EntryId[]>();
  for (const entryId of entryIds) {
    const p = points.get(entryId)!;
    byPoints.set(p, [...(byPoints.get(p) ?? []), entryId]);
  }
  const sortedPoints = [...byPoints.keys()].sort((a, b) => b - a);

  const ordered: { entryId: EntryId; resolvedByDecision: boolean }[] = [];
  const unresolvedTies: CallbackUnresolvedTie[] = [];

  let position = 0;
  for (const p of sortedPoints) {
    const group = byPoints.get(p)!;
    const start = position;
    const stop = position + group.length;
    const crossesAdvance = start < callbackCount && stop > callbackCount;
    const alternateBoundary = callbackCount + alternateCount;
    const crossesAlternate =
      start < alternateBoundary && stop > alternateBoundary;

    let resolvedByDecision = false;
    let orderedGroup = group;
    if (group.length > 1 && (crossesAdvance || crossesAlternate)) {
      const manual = findManualResolution(group);
      if (manual) {
        orderedGroup = manual;
        resolvedByDecision = true;
      } else {
        unresolvedTies.push({
          entryIds: [...group],
          points: p,
          boundary: crossesAdvance ? "advance" : "alternate",
        });
      }
    }
    for (const entryId of orderedGroup) {
      ordered.push({ entryId, resolvedByDecision });
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
    };
  });

  return { ranked, unresolvedTies };
}
