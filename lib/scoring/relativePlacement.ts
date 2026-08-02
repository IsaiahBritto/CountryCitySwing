/**
 * Relative Placement Scoring System (RPSS) tabulation engine.
 *
 * Implements the algorithm described in the WSDC "Unraveling the Mystery of
 * the Relative Placement Scoring System" document (Jim Tigges):
 *
 * 1. Each judge ranks every entry with a unique ordinal (1 = best).
 * 2. An entry is placed once a majority of judges have it at or better than a
 *    given placement level; entries with a larger majority at the same level
 *    place first.
 * 3. Ties at a level are broken by the sum of the ordinals forming the tying
 *    majority (lower sum wins).
 * 4. Entries still tied are compared by their counts at the next levels.
 * 5. Entries tied through the last level go to a head-to-head comparison:
 *    the entry a majority of judges scored over the other places higher.
 * 6. Head-to-head can be undecidable (even panel split, or a preference cycle
 *    among 3+ entries). Those ties resolve via the chief judge's ordinals if
 *    available, an explicit manual (director) resolution, or are reported as
 *    unresolved for the round-verification flow to decide.
 *
 * Pure functions, no I/O: the API layer loads scores and persists results.
 */

export type EntryId = string;
export type JudgeId = string;

export interface RelativePlacementInput {
  /** Panel judges participating in majority math, in display order. */
  judgeIds: JudgeId[];
  entryIds: EntryId[];
  /** ordinals[judgeId][entryId] = 1..N, a complete permutation per judge. */
  ordinals: Record<JudgeId, Record<EntryId, number>>;
  /**
   * Optional chief judge sheet (excluded from majority math) used to break
   * otherwise-unresolvable ties.
   */
  chiefJudgeOrdinals?: Record<EntryId, number> | null;
  /**
   * Explicit resolutions recorded by the coordinator/chief judge in the
   * round-verification view. Each array is the final order (best first) for a
   * set of entries the algorithm could not separate.
   */
  manualTieResolutions?: EntryId[][];
}

export interface GridCell {
  /** How many panel judges scored this entry at or better than this level. */
  count: number;
  /** Sum of the ordinals at or better than this level (tie-break stage 1). */
  sum: number;
  /** True when count reaches the majority. */
  majority: boolean;
}

export interface GridRow {
  entryId: EntryId;
  /** Panel ordinals in judgeIds order. */
  ordinals: number[];
  /** cells[level - 1] holds the tally for placement level `level`. */
  cells: GridCell[];
  placement: number | null;
  /** The 1st-through-N level at which this entry earned its placement. */
  decidedAtLevel: number | null;
  tieBreakNote: string | null;
}

export type UnresolvedTieReason = "head_to_head_tie" | "head_to_head_cycle";

export interface UnresolvedTie {
  entryIds: EntryId[];
  /** The contiguous placements this group will occupy once resolved. */
  placements: number[];
  reason: UnresolvedTieReason;
}

export interface RelativePlacementResult {
  judgeCount: number;
  majority: number;
  /** Null placement means the entry is inside an unresolved tie group. */
  placements: Record<EntryId, number | null>;
  grid: GridRow[];
  unresolvedTies: UnresolvedTie[];
}

interface OrderedEntry {
  entryId: EntryId;
  note: string | null;
  /** Index into the unresolved list when this entry's order is undecided. */
  unresolvedIndex: number | null;
}

export class RelativePlacementError extends Error {}

/**
 * Removes scratched entries from each judge's sheet and closes the ordinal
 * gaps, preserving each judge's relative order of the remaining entries.
 */
export function compressOrdinals(
  ordinals: Record<JudgeId, Record<EntryId, number>>,
  activeEntryIds: EntryId[]
): Record<JudgeId, Record<EntryId, number>> {
  const out: Record<JudgeId, Record<EntryId, number>> = {};
  for (const judgeId of Object.keys(ordinals)) {
    const sheet = ordinals[judgeId];
    const sorted = activeEntryIds
      .filter((e) => sheet[e] != null)
      .sort((a, b) => sheet[a] - sheet[b]);
    const compressed: Record<EntryId, number> = {};
    sorted.forEach((entryId, i) => {
      compressed[entryId] = i + 1;
    });
    out[judgeId] = compressed;
  }
  return out;
}

/** Counts how many judges preferred A over B (lower ordinal wins per judge). */
export function pairwisePreference(
  ordinalsA: number[],
  ordinalsB: number[]
): { aWins: number; bWins: number } {
  let aWins = 0;
  let bWins = 0;
  for (let i = 0; i < ordinalsA.length; i++) {
    if (ordinalsA[i] < ordinalsB[i]) aWins++;
    else if (ordinalsB[i] < ordinalsA[i]) bWins++;
  }
  return { aWins, bWins };
}

export function tabulateRelativePlacement(
  input: RelativePlacementInput
): RelativePlacementResult {
  const { judgeIds, entryIds, ordinals } = input;
  const judgeCount = judgeIds.length;
  const entryCount = entryIds.length;

  if (judgeCount === 0) throw new RelativePlacementError("No judges provided");
  if (entryCount === 0) throw new RelativePlacementError("No entries provided");

  // Validate: every judge sheet must be a complete permutation of 1..N.
  for (const judgeId of judgeIds) {
    const sheet = ordinals[judgeId];
    if (!sheet) {
      throw new RelativePlacementError(`Missing sheet for judge ${judgeId}`);
    }
    const seen = new Set<number>();
    for (const entryId of entryIds) {
      const ord = sheet[entryId];
      if (!Number.isInteger(ord) || ord < 1 || ord > entryCount) {
        throw new RelativePlacementError(
          `Judge ${judgeId} has an invalid ordinal for entry ${entryId}`
        );
      }
      if (seen.has(ord)) {
        throw new RelativePlacementError(
          `Judge ${judgeId} has duplicate ordinal ${ord}`
        );
      }
      seen.add(ord);
    }
  }

  const majority = Math.floor(judgeCount / 2) + 1;

  const ordinalRows: Record<EntryId, number[]> = {};
  for (const entryId of entryIds) {
    ordinalRows[entryId] = judgeIds.map((j) => ordinals[j][entryId]);
  }

  // counts[entryId][level - 1] / sums[entryId][level - 1]
  const counts: Record<EntryId, number[]> = {};
  const sums: Record<EntryId, number[]> = {};
  for (const entryId of entryIds) {
    const row = ordinalRows[entryId];
    const c: number[] = [];
    const s: number[] = [];
    for (let level = 1; level <= entryCount; level++) {
      let count = 0;
      let sum = 0;
      for (const ord of row) {
        if (ord <= level) {
          count++;
          sum += ord;
        }
      }
      c.push(count);
      s.push(sum);
    }
    counts[entryId] = c;
    sums[entryId] = s;
  }

  const countAt = (entryId: EntryId, level: number) => counts[entryId][level - 1];
  const sumAt = (entryId: EntryId, level: number) => sums[entryId][level - 1];

  const manualResolutions = input.manualTieResolutions ?? [];
  const cjOrdinals = input.chiefJudgeOrdinals ?? null;

  const unresolvedGroups: { entryIds: EntryId[]; reason: UnresolvedTieReason }[] =
    [];

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

  /**
   * Resolves a group the panel could not separate. Order of preference:
   * manual (director) resolution, chief judge ordinals, otherwise the group is
   * recorded as unresolved and its members get null placements.
   */
  const resolveExternally = (
    group: EntryId[],
    reason: UnresolvedTieReason
  ): OrderedEntry[] => {
    const manual = findManualResolution(group);
    if (manual) {
      return manual.map((entryId) => ({
        entryId,
        note: "Tie resolved by coordinator/chief judge decision",
        unresolvedIndex: null,
      }));
    }
    if (cjOrdinals) {
      const allScored = group.every((e) => Number.isFinite(cjOrdinals[e]));
      const distinct =
        new Set(group.map((e) => cjOrdinals[e])).size === group.length;
      if (allScored && distinct) {
        return [...group]
          .sort((a, b) => cjOrdinals[a] - cjOrdinals[b])
          .map((entryId) => ({
            entryId,
            note: "Tie broken by chief judge's ordinals",
            unresolvedIndex: null,
          }));
      }
    }
    const index = unresolvedGroups.length;
    unresolvedGroups.push({ entryIds: [...group], reason });
    return group.map((entryId) => ({
      entryId,
      note:
        reason === "head_to_head_cycle"
          ? "Unresolved: head-to-head preference cycle"
          : "Unresolved: head-to-head split evenly",
      unresolvedIndex: index,
    }));
  };

  /** Stage 3: head-to-head majority comparison among fully tied entries. */
  const orderByHeadToHead = (group: EntryId[]): OrderedEntry[] => {
    if (group.length === 2) {
      const [a, b] = group;
      const { aWins, bWins } = pairwisePreference(
        ordinalRows[a],
        ordinalRows[b]
      );
      if (aWins !== bWins) {
        const winner = aWins > bWins ? a : b;
        const loser = winner === a ? b : a;
        const note = `Tie broken head-to-head (${Math.max(aWins, bWins)} of ${judgeCount} judges)`;
        return [
          { entryId: winner, note, unresolvedIndex: null },
          { entryId: loser, note, unresolvedIndex: null },
        ];
      }
      return resolveExternally(group, "head_to_head_tie");
    }

    // 3+ entries: round-robin record; strict win-count order resolves it,
    // anything else (a cycle or an even-panel split) cannot be decided by the
    // panel.
    const wins = new Map<EntryId, number>();
    let hadPairTie = false;
    for (const e of group) wins.set(e, 0);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const { aWins, bWins } = pairwisePreference(
          ordinalRows[a],
          ordinalRows[b]
        );
        if (aWins > bWins) wins.set(a, wins.get(a)! + 1);
        else if (bWins > aWins) wins.set(b, wins.get(b)! + 1);
        else hadPairTie = true;
      }
    }
    const distinctWinCounts = new Set(group.map((e) => wins.get(e))).size;
    if (!hadPairTie && distinctWinCounts === group.length) {
      return [...group]
        .sort((a, b) => wins.get(b)! - wins.get(a)!)
        .map((entryId) => ({
          entryId,
          note: "Tie broken by head-to-head round-robin",
          unresolvedIndex: null,
        }));
    }
    return resolveExternally(
      group,
      hadPairTie ? "head_to_head_tie" : "head_to_head_cycle"
    );
  };

  /** Stage 2: compare counts at subsequent levels until separated. */
  const orderByNextLevels = (
    group: EntryId[],
    fromLevel: number
  ): OrderedEntry[] => {
    if (group.length === 1) {
      return [{ entryId: group[0], note: null, unresolvedIndex: null }];
    }
    if (fromLevel > entryCount) {
      return orderByHeadToHead(group);
    }
    const byCount = new Map<number, EntryId[]>();
    for (const entryId of group) {
      const c = countAt(entryId, fromLevel);
      byCount.set(c, [...(byCount.get(c) ?? []), entryId]);
    }
    if (byCount.size === 1) {
      return orderByNextLevels(group, fromLevel + 1);
    }
    const ordered: OrderedEntry[] = [];
    const sortedCounts = [...byCount.keys()].sort((a, b) => b - a);
    for (const c of sortedCounts) {
      const sub = byCount.get(c)!;
      if (sub.length === 1) {
        ordered.push({
          entryId: sub[0],
          note: `Tie broken by 1st-${fromLevel} count (${c})`,
          unresolvedIndex: null,
        });
      } else {
        ordered.push(...orderByNextLevels(sub, fromLevel + 1));
      }
    }
    return ordered;
  };

  /** Stage 1: entries with equal majority counts at `level`, ordered by sum. */
  const orderTiedAtLevel = (
    group: EntryId[],
    level: number
  ): OrderedEntry[] => {
    if (group.length === 1) {
      return [{ entryId: group[0], note: null, unresolvedIndex: null }];
    }
    const bySum = new Map<number, EntryId[]>();
    for (const entryId of group) {
      const s = sumAt(entryId, level);
      bySum.set(s, [...(bySum.get(s) ?? []), entryId]);
    }
    const ordered: OrderedEntry[] = [];
    const sortedSums = [...bySum.keys()].sort((a, b) => a - b);
    for (const s of sortedSums) {
      const sub = bySum.get(s)!;
      if (sub.length === 1) {
        if (bySum.size > 1) {
          ordered.push({
            entryId: sub[0],
            note: `Tie broken by sum of ordinals (${s})`,
            unresolvedIndex: null,
          });
        } else {
          ordered.push({ entryId: sub[0], note: null, unresolvedIndex: null });
        }
      } else {
        const deeper = orderByNextLevels(sub, level + 1);
        ordered.push(
          ...deeper.map((o) => ({
            ...o,
            note: o.note
              ? `Sum of ordinals tied (${s}); ${o.note}`
              : `Sum of ordinals tied (${s})`,
          }))
        );
      }
    }
    return ordered;
  };

  // Main placement loop.
  const placements: Record<EntryId, number | null> = {};
  const decidedAtLevel: Record<EntryId, number | null> = {};
  const tieBreakNotes: Record<EntryId, string | null> = {};
  const unresolvedPlacements = new Map<number, number[]>();

  let active = [...entryIds];
  let nextPlacement = 1;

  for (let level = 1; level <= entryCount && active.length > 0; level++) {
    const qualifying = active.filter((e) => countAt(e, level) >= majority);
    if (qualifying.length === 0) continue;

    // Larger majority counts place first.
    const byCount = new Map<number, EntryId[]>();
    for (const entryId of qualifying) {
      const c = countAt(entryId, level);
      byCount.set(c, [...(byCount.get(c) ?? []), entryId]);
    }
    const sortedCounts = [...byCount.keys()].sort((a, b) => b - a);

    for (const c of sortedCounts) {
      const group = byCount.get(c)!;
      const ordered = orderTiedAtLevel(group, level);
      for (const item of ordered) {
        const placement = nextPlacement++;
        decidedAtLevel[item.entryId] = level;
        tieBreakNotes[item.entryId] = item.note;
        if (item.unresolvedIndex != null) {
          placements[item.entryId] = null;
          unresolvedPlacements.set(item.unresolvedIndex, [
            ...(unresolvedPlacements.get(item.unresolvedIndex) ?? []),
            placement,
          ]);
        } else {
          placements[item.entryId] = placement;
        }
      }
    }

    const placed = new Set(qualifying);
    active = active.filter((e) => !placed.has(e));
  }

  // Every entry has all N ordinals <= N, so by the last level everyone has a
  // grand-slam majority; active must be empty here.
  if (active.length > 0) {
    throw new RelativePlacementError(
      "Tabulation failed to place all entries (internal error)"
    );
  }

  const unresolvedTies: UnresolvedTie[] = unresolvedGroups.map((g, i) => ({
    entryIds: g.entryIds,
    placements: unresolvedPlacements.get(i) ?? [],
    reason: g.reason,
  }));

  const grid: GridRow[] = entryIds.map((entryId) => ({
    entryId,
    ordinals: ordinalRows[entryId],
    cells: counts[entryId].map((count, i) => ({
      count,
      sum: sums[entryId][i],
      majority: count >= majority,
    })),
    placement: placements[entryId],
    decidedAtLevel: decidedAtLevel[entryId] ?? null,
    tieBreakNote: tieBreakNotes[entryId] ?? null,
  }));

  return {
    judgeCount,
    majority,
    placements,
    grid,
    unresolvedTies,
  };
}
