/**
 * Finals judging sync: raw scores drive partial ordinals during scoring;
 * verify step finalizes full 1..N ranking and adjusts raw on reorder.
 */

export interface FinalsScoreItem {
  entryId: string;
  /** Placement 1..N; null until ranked (partial during scoring). */
  ordinal: number | null;
  /** Raw score 0-100, one decimal; null until set. */
  raw: number | null;
}

const SPREAD_FLOOR = 20;
const SLOT_MIN_RAW = 0.1;
const RAW_CEILING = 100;
const NUDGE_STEP = 0.1;

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampScore(value: number): number {
  return roundScore(Math.min(100, Math.max(0, value)));
}

/** Average of two scores, rounded to one decimal (tenths math avoids float drift). */
export function midpointScore(a: number, b: number): number {
  const midTenths = Math.round((Math.round(a * 10) + Math.round(b * 10)) / 2);
  return midTenths / 10;
}

function otherRaws(
  snapshot: Map<string, number>,
  excludeEntryId: string
): Set<number> {
  return new Set(
    [...snapshot.entries()]
      .filter(([id]) => id !== excludeEntryId)
      .map(([, raw]) => raw)
  );
}

function withoutTie(
  raw: number,
  used: Set<number>,
  preferLower: boolean
): number {
  let value = clampScore(raw);
  let steps = 0;
  while (used.has(value) && steps < 200) {
    value = clampScore(value + (preferLower ? -NUDGE_STEP : NUDGE_STEP));
    steps++;
  }
  return value;
}

function isTightNeighborGap(
  aboveRaw: number | null,
  belowRaw: number | null
): boolean {
  return (
    aboveRaw != null &&
    belowRaw != null &&
    aboveRaw - belowRaw <= NUDGE_STEP
  );
}

function isTightEdgeAtFirst(belowRaw: number | null): boolean {
  return (
    belowRaw != null && RAW_CEILING - belowRaw <= NUDGE_STEP
  );
}

function isTightEdgeAtLast(aboveRaw: number | null): boolean {
  return (
    aboveRaw != null && aboveRaw - SLOT_MIN_RAW <= NUDGE_STEP
  );
}

function usedRawsForEntries(
  rawById: Map<string, number>,
  excludeEntryIds: string[]
): Set<number> {
  const exclude = new Set(excludeEntryIds);
  const used = new Set<number>();
  for (const [id, raw] of rawById) {
    if (exclude.has(id)) continue;
    used.add(roundScore(raw));
  }
  return used;
}

function findUniqueNudgeDown(fromRaw: number, used: Set<number>): number | null {
  const fromTenths = Math.round(fromRaw * 10);
  for (let tenths = fromTenths - 1; tenths >= 1; tenths--) {
    const value = roundScore(tenths / 10);
    if (Math.round(value * 10) >= fromTenths) continue;
    if (!used.has(value)) return value;
  }
  return null;
}

function findUniqueNudgeUp(fromRaw: number, used: Set<number>): number | null {
  const fromTenths = Math.round(fromRaw * 10);
  for (let tenths = fromTenths + 1; tenths <= 1000; tenths++) {
    const value = roundScore(tenths / 10);
    if (Math.round(value * 10) <= fromTenths) continue;
    if (!used.has(value)) return value;
  }
  return null;
}

function finalsItemsWithRaws(
  reordered: FinalsScoreItem[],
  rawById: Map<string, number>
): FinalsScoreItem[] {
  return reordered.map((row, index) => ({
    entryId: row.entryId,
    ordinal: index + 1,
    raw: rawById.get(row.entryId) ?? null,
  }));
}

/** Midpoint for inserted rank when only the moved entry's raw changes (wide neighbor gap). */
function movedRawForRank(
  targetRank: number,
  lastRank: number,
  aboveRaw: number | null,
  belowRaw: number | null,
  usedOtherRaws: Set<number>
): number {
  let candidate: number;
  if (targetRank === 1) {
    candidate =
      belowRaw != null
        ? midpointScore(RAW_CEILING, belowRaw)
        : RAW_CEILING;
    if (belowRaw != null && candidate <= belowRaw) {
      candidate = roundScore(belowRaw + NUDGE_STEP);
    }
    candidate = Math.min(candidate, RAW_CEILING);
  } else if (targetRank === lastRank) {
    candidate =
      aboveRaw != null
        ? midpointScore(aboveRaw, SLOT_MIN_RAW)
        : SLOT_MIN_RAW;
    if (aboveRaw != null && candidate >= aboveRaw) {
      candidate = roundScore(aboveRaw - NUDGE_STEP);
    }
    candidate = Math.max(candidate, SLOT_MIN_RAW);
  } else {
    candidate = midpointScore(aboveRaw!, belowRaw!);
    if (candidate >= aboveRaw!) {
      candidate = roundScore(aboveRaw! - NUDGE_STEP);
    }
    if (candidate <= belowRaw!) {
      candidate = roundScore(belowRaw! + NUDGE_STEP);
    }
  }

  let raw = withoutTie(candidate, usedOtherRaws, true);
  raw = Math.max(raw, SLOT_MIN_RAW);

  if (aboveRaw != null && raw >= aboveRaw) {
    raw = withoutTie(roundScore(aboveRaw - NUDGE_STEP), usedOtherRaws, true);
  }
  if (belowRaw != null && raw <= belowRaw) {
    raw = withoutTie(roundScore(belowRaw + NUDGE_STEP), usedOtherRaws, true);
  }

  if (aboveRaw != null && belowRaw != null) {
    raw = Math.min(raw, aboveRaw);
    raw = Math.max(raw, belowRaw);
  }

  return clampScore(Math.max(raw, SLOT_MIN_RAW));
}

function midpointMovedRawAtFirst(
  nudgedBelow: number,
  usedOtherRaws: Set<number>
): number {
  let raw = midpointScore(RAW_CEILING, nudgedBelow);
  if (raw <= nudgedBelow) {
    raw = roundScore(nudgedBelow + NUDGE_STEP);
  }
  raw = withoutTie(raw, usedOtherRaws, true);
  raw = Math.min(raw, RAW_CEILING);
  if (raw <= nudgedBelow) {
    raw = RAW_CEILING;
  }
  return clampScore(raw);
}

function midpointMovedRawAtLast(
  nudgedAbove: number,
  usedOtherRaws: Set<number>
): number {
  let raw = midpointScore(nudgedAbove, SLOT_MIN_RAW);
  if (raw >= nudgedAbove) {
    raw = roundScore(nudgedAbove - NUDGE_STEP);
  }
  raw = withoutTie(raw, usedOtherRaws, true);
  raw = Math.min(raw, roundScore(nudgedAbove - NUDGE_STEP));
  raw = Math.max(raw, SLOT_MIN_RAW);
  return clampScore(raw);
}

function midpointMovedRaw(
  aboveRaw: number,
  belowRaw: number,
  usedOtherRaws: Set<number>
): number {
  let raw = midpointScore(aboveRaw, belowRaw);
  if (raw >= aboveRaw) raw = roundScore(aboveRaw - NUDGE_STEP);
  if (raw <= belowRaw) raw = roundScore(belowRaw + NUDGE_STEP);
  raw = withoutTie(raw, usedOtherRaws, true);
  raw = Math.min(raw, aboveRaw);
  raw = Math.max(raw, belowRaw);
  return clampScore(Math.max(raw, SLOT_MIN_RAW));
}

type InsertStrategy = "nudgeBelow" | "nudgeAbove" | "movedOnly";

function tryInsertStrategy(
  strategy: InsertStrategy,
  reordered: FinalsScoreItem[],
  targetRank: number,
  lastRank: number,
  movedEntryId: string,
  baseRawById: Map<string, number>
): Map<string, number> | null {
  const aboveEntry =
    targetRank > 1 ? reordered[targetRank - 2]! : undefined;
  const belowEntry =
    targetRank < lastRank ? reordered[targetRank]! : undefined;
  const aboveRaw = aboveEntry?.raw ?? null;
  const belowRaw = belowEntry?.raw ?? null;

  const rawById = new Map(baseRawById);

  if (strategy === "nudgeBelow") {
    if (targetRank === 1 && belowEntry && belowRaw != null) {
      const usedBelow = usedRawsForEntries(rawById, [
        movedEntryId,
        belowEntry.entryId,
      ]);
      const nudgedBelow = findUniqueNudgeDown(belowRaw, usedBelow);
      if (nudgedBelow == null) return null;
      rawById.set(belowEntry.entryId, nudgedBelow);
      const usedMoved = usedRawsForEntries(rawById, [movedEntryId]);
      rawById.set(
        movedEntryId,
        midpointMovedRawAtFirst(nudgedBelow, usedMoved)
      );
    } else if (aboveRaw == null || belowRaw == null || !belowEntry) {
      return null;
    } else {
      const usedBelow = usedRawsForEntries(rawById, [
        movedEntryId,
        belowEntry.entryId,
      ]);
      const nudgedBelow = findUniqueNudgeDown(belowRaw, usedBelow);
      if (nudgedBelow == null) return null;
      rawById.set(belowEntry.entryId, nudgedBelow);
      const usedMoved = usedRawsForEntries(rawById, [movedEntryId]);
      const movedRaw = midpointMovedRaw(aboveRaw, nudgedBelow, usedMoved);
      rawById.set(movedEntryId, movedRaw);
    }
  } else if (strategy === "nudgeAbove") {
    if (targetRank === lastRank && aboveEntry && aboveRaw != null) {
      const usedAbove = usedRawsForEntries(rawById, [
        movedEntryId,
        aboveEntry.entryId,
      ]);
      const nudgedAbove = findUniqueNudgeUp(aboveRaw, usedAbove);
      if (nudgedAbove == null) return null;
      rawById.set(aboveEntry.entryId, nudgedAbove);
      const usedMoved = usedRawsForEntries(rawById, [movedEntryId]);
      rawById.set(
        movedEntryId,
        midpointMovedRawAtLast(nudgedAbove, usedMoved)
      );
    } else if (aboveRaw == null || belowRaw == null || !aboveEntry) {
      return null;
    } else {
      const usedAbove = usedRawsForEntries(rawById, [
        movedEntryId,
        aboveEntry.entryId,
      ]);
      const nudgedAbove = findUniqueNudgeUp(aboveRaw, usedAbove);
      if (nudgedAbove == null) return null;
      rawById.set(aboveEntry.entryId, nudgedAbove);
      const usedMoved = usedRawsForEntries(rawById, [movedEntryId]);
      const movedRaw = midpointMovedRaw(nudgedAbove, belowRaw, usedMoved);
      rawById.set(movedEntryId, movedRaw);
    }
  } else {
    const used = usedRawsForEntries(rawById, [movedEntryId]);
    const movedRaw = movedRawForRank(
      targetRank,
      lastRank,
      aboveRaw,
      belowRaw,
      used
    );
    rawById.set(movedEntryId, movedRaw);
  }

  if (tiedEntryIds(finalsItemsWithRaws(reordered, rawById)).length > 0) {
    return null;
  }
  return rawById;
}

/** Assign raws after insert; may nudge one immediate neighbor when gap ≤ 0.1. */
function assignRawsForInsertAtRank(
  reordered: FinalsScoreItem[],
  targetRank: number,
  movedEntryId: string,
  items: FinalsScoreItem[]
): Map<string, number> {
  const lastRank = reordered.length;
  const baseRawById = new Map<string, number>();
  for (const row of items) {
    if (row.raw != null) baseRawById.set(row.entryId, roundScore(row.raw));
  }

  const aboveRaw =
    targetRank > 1 ? (reordered[targetRank - 2]!.raw ?? null) : null;
  const belowRaw =
    targetRank < lastRank ? (reordered[targetRank]!.raw ?? null) : null;

  const tightMiddle =
    targetRank !== 1 &&
    targetRank !== lastRank &&
    isTightNeighborGap(aboveRaw, belowRaw);
  const tightEdgeFirst =
    targetRank === 1 && isTightEdgeAtFirst(belowRaw);
  const tightEdgeLast =
    targetRank === lastRank && isTightEdgeAtLast(aboveRaw);

  const tryStrategies = (strategies: InsertStrategy[]) => {
    for (const strategy of strategies) {
      const result = tryInsertStrategy(
        strategy,
        reordered,
        targetRank,
        lastRank,
        movedEntryId,
        baseRawById
      );
      if (result) return result;
    }
    return null;
  };

  if (tightMiddle) {
    const result = tryStrategies([
      "nudgeBelow",
      "nudgeAbove",
      "movedOnly",
    ]);
    if (result) return result;
  }

  if (tightEdgeFirst) {
    const result = tryStrategies([
      "nudgeBelow",
      "nudgeAbove",
      "movedOnly",
    ]);
    if (result) return result;
  }

  if (tightEdgeLast) {
    const result = tryStrategies([
      "nudgeAbove",
      "nudgeBelow",
      "movedOnly",
    ]);
    if (result) return result;
  }

  const movedOnly = tryInsertStrategy(
    "movedOnly",
    reordered,
    targetRank,
    lastRank,
    movedEntryId,
    baseRawById
  );
  if (movedOnly) return movedOnly;

  const rawById = new Map(baseRawById);
  const used = usedRawsForEntries(rawById, [movedEntryId]);
  rawById.set(
    movedEntryId,
    movedRawForRank(targetRank, lastRank, aboveRaw, belowRaw, used)
  );
  return rawById;
}

/**
 * Inserts the moved entry at targetRank (1..N). Moved raw is the midpoint
 * between neighbors (100 / 0.1 at edges). When gap ≤ 0.1, may nudge one
 * immediate neighbor ±0.1 so all raws stay unique.
 */
export function moveEntryToRank(
  items: FinalsScoreItem[],
  movedEntryId: string,
  targetRank: number
): FinalsScoreItem[] {
  const ordered = itemsInRankOrder(items);
  const fromIdx = ordered.findIndex((i) => i.entryId === movedEntryId);
  if (fromIdx === -1) return items;

  const n = ordered.length;
  if (targetRank < 1 || targetRank > n) return items;

  const currentRank = fromIdx + 1;
  if (targetRank === currentRank) return items;

  const moved = ordered[fromIdx]!;
  if (moved.raw == null) return items;

  const reordered = [...ordered];
  const [entry] = reordered.splice(fromIdx, 1);
  reordered.splice(targetRank - 1, 0, entry);

  const rawById = assignRawsForInsertAtRank(
    reordered,
    targetRank,
    movedEntryId,
    items
  );

  return reordered.map((row, index) => ({
    entryId: row.entryId,
    ordinal: index + 1,
    raw: rawById.get(row.entryId) ?? null,
  }));
}

/**
 * Fits a candidate raw into a rank slot. Returns the moved entry's raw and,
 * only when necessary, an optional neighbor nudge (±0.1) to create room.
 */
export function fitRawInSlot(
  candidate: number,
  aboveRaw: number | null,
  belowRaw: number | null,
  snapshot: Map<string, number>,
  movedEntryId: string
): {
  raw: number;
  nudgeAbove?: number;
  nudgeBelow?: number;
} {
  const used = otherRaws(snapshot, movedEntryId);
  let nudgeAbove: number | undefined;
  let nudgeBelow: number | undefined;

  let above = aboveRaw;
  let below = belowRaw;

  if (above != null && below != null && above - below < NUDGE_STEP * 2) {
    const roomAbove = RAW_CEILING - above;
    const roomBelow = below - SLOT_MIN_RAW;
    if (roomAbove >= roomBelow && above + NUDGE_STEP <= RAW_CEILING) {
      nudgeAbove = clampScore(above + NUDGE_STEP);
      used.delete(above);
      above = nudgeAbove;
      used.add(nudgeAbove);
    } else if (below - NUDGE_STEP >= SLOT_MIN_RAW) {
      nudgeBelow = clampScore(below - NUDGE_STEP);
      used.delete(below);
      below = nudgeBelow;
      used.add(nudgeBelow);
    }
  }

  let raw: number;
  if (above == null && below != null) {
    raw = midpointScore(RAW_CEILING, below);
    raw = Math.min(raw, RAW_CEILING);
    raw = Math.max(raw, below + NUDGE_STEP);
    if (used.has(RAW_CEILING) || raw <= below) {
      nudgeBelow = clampScore(below - NUDGE_STEP);
      used.delete(below);
      used.add(nudgeBelow);
      raw = RAW_CEILING;
    }
  } else if (above != null && below == null) {
    raw = roundScore(above - NUDGE_STEP);
    raw = Math.max(raw, SLOT_MIN_RAW);
    if (raw >= above) {
      nudgeAbove = clampScore(above + NUDGE_STEP);
      used.delete(above);
      above = nudgeAbove;
      used.add(nudgeAbove);
      raw = SLOT_MIN_RAW;
    }
  } else if (above != null && below != null) {
    raw = midpointScore(above, below);
    if (raw >= above) raw = roundScore(above - NUDGE_STEP);
    if (raw <= below) raw = roundScore(below + NUDGE_STEP);
  } else {
    raw = clampScore(candidate);
  }

  raw = withoutTie(raw, used, true);
  raw = Math.max(raw, SLOT_MIN_RAW);

  if (
    aboveRaw != null &&
    belowRaw == null &&
    raw >= (nudgeAbove ?? aboveRaw)
  ) {
    if (nudgeAbove == null) {
      nudgeAbove = clampScore(aboveRaw + NUDGE_STEP);
    }
    raw = SLOT_MIN_RAW;
  }

  if (belowRaw != null && raw === belowRaw && nudgeBelow == null) {
    nudgeBelow = clampScore(belowRaw - NUDGE_STEP);
    used.add(nudgeBelow);
    raw = withoutTie(midpointScore(above ?? RAW_CEILING, nudgeBelow), used, true);
  }

  return { raw, nudgeAbove, nudgeBelow };
}

/**
 * @deprecated Prefer moveEntryToRank — inserts at the partner's rank (not a raw swap).
 */
export function reorderMovedEntry(
  items: FinalsScoreItem[],
  movedEntryId: string,
  swapWithEntryId: string
): FinalsScoreItem[] {
  const partner = items.find((i) => i.entryId === swapWithEntryId);
  if (!partner || partner.ordinal == null) return items;
  return moveEntryToRank(items, movedEntryId, partner.ordinal);
}

/** @deprecated Use moveEntryToRank. */
export function reorderRankedAndSeedAll(
  items: FinalsScoreItem[],
  movedEntryId: string,
  swapWithEntryId: string
): FinalsScoreItem[] {
  const partner = items.find((i) => i.entryId === swapWithEntryId);
  if (!partner?.ordinal) return items;
  return moveEntryToRank(items, movedEntryId, partner.ordinal);
}

/** Assigns raw 100→floor for every id in rank order (all receive a score). */
export function seedRawFromRankOrder(
  orderedEntryIds: string[],
  options?: { floor?: number; ceiling?: number }
): Map<string, number> {
  const floor = options?.floor ?? SPREAD_FLOOR;
  const ceiling = options?.ceiling ?? RAW_CEILING;
  const out = new Map<string, number>();
  const n = orderedEntryIds.length;
  if (n === 0) return out;
  if (n === 1) {
    out.set(orderedEntryIds[0], clampScore(ceiling));
    return out;
  }
  const span = ceiling - floor;
  for (let i = 0; i < n; i++) {
    out.set(
      orderedEntryIds[i],
      clampScore(ceiling - (i * span) / (n - 1))
    );
  }
  return out;
}

export function allScored(items: FinalsScoreItem[]): boolean {
  return items.length > 0 && items.every((i) => i.raw != null);
}

export function canOpenVerify(items: FinalsScoreItem[]): boolean {
  return allScored(items) && tiedEntryIds(items).length === 0;
}

/**
 * Assigns ordinals 1..N by raw desc when every entry is scored with no ties.
 * Returns null if prerequisites fail.
 */
export function finalizeAllRankings(
  items: FinalsScoreItem[]
): FinalsScoreItem[] | null {
  if (!canOpenVerify(items)) return null;

  const ranked = [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRaw = a.item.raw!;
      const bRaw = b.item.raw!;
      if (aRaw !== bRaw) return bRaw - aRaw;
      return a.index - b.index;
    });

  const rankById = new Map(
    ranked.map(({ item }, i) => [item.entryId, i + 1] as const)
  );

  return items.map((i) => ({
    ...i,
    ordinal: rankById.get(i.entryId)!,
  }));
}

/** Reseed raw 100→20 for every entry with an ordinal (expects full N at verify). */
export function reseedAllRawFromOrdinals(
  items: FinalsScoreItem[]
): FinalsScoreItem[] {
  const ranked = [...items]
    .filter((i) => i.ordinal != null)
    .sort((a, b) => a.ordinal! - b.ordinal!);
  const seeds = seedRawFromRankOrder(ranked.map((i) => i.entryId));
  return items.map((i) =>
    i.ordinal != null
      ? { ...i, raw: seeds.get(i.entryId) ?? i.raw }
      : i
  );
}

/**
 * Applies a raw-score edit and reassigns ordinals by raw desc (edited entry
 * wins ties). Entries without raw lose their ordinal.
 */
export function applyRawChange(
  items: FinalsScoreItem[],
  entryId: string,
  newRaw: number
): FinalsScoreItem[] {
  const value = clampScore(newRaw);
  const next = items.map((i) =>
    i.entryId === entryId ? { ...i, raw: value } : { ...i }
  );

  const ranked = next
    .filter((i) => i.raw != null)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRaw = a.item.raw!;
      const bRaw = b.item.raw!;
      if (aRaw !== bRaw) return bRaw - aRaw;
      if (a.item.entryId === entryId) return -1;
      if (b.item.entryId === entryId) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);

  const rankById = new Map(
    ranked.map((item, i) => [item.entryId, i + 1] as const)
  );

  return next.map((i) => ({
    ...i,
    ordinal: rankById.get(i.entryId) ?? null,
  }));
}

/** Entry ids involved in any exact raw-score tie (blocks verify/submit). */
export function tiedEntryIds(items: FinalsScoreItem[]): string[] {
  const byRaw = new Map<number, string[]>();
  for (const item of items) {
    if (item.raw == null) continue;
    byRaw.set(item.raw, [...(byRaw.get(item.raw) ?? []), item.entryId]);
  }
  const tied: string[] = [];
  for (const group of byRaw.values()) {
    if (group.length > 1) tied.push(...group);
  }
  return tied;
}

/** For each entry in a duplicate-raw group, bib numbers of the other tied entries. */
export function finalsTiedWithBibsByEntryId(
  items: FinalsScoreItem[],
  bibByEntryId: Map<string, number | null>
): Map<string, number[]> {
  const byRaw = new Map<number, string[]>();
  for (const item of items) {
    if (item.raw == null) continue;
    byRaw.set(item.raw, [...(byRaw.get(item.raw) ?? []), item.entryId]);
  }
  const out = new Map<string, number[]>();
  for (const group of byRaw.values()) {
    if (group.length < 2) continue;
    for (const entryId of group) {
      const bibs = group
        .filter((id) => id !== entryId)
        .map((id) => bibByEntryId.get(id))
        .filter((b): b is number => b != null)
        .sort((a, b) => a - b);
      out.set(entryId, bibs);
    }
  }
  return out;
}

export function toOrdinals(items: FinalsScoreItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    if (item.ordinal != null) out[item.entryId] = item.ordinal;
  }
  return out;
}

/**
 * Evenly respreads non-null raw scores from ceiling down to floor in the given
 * rank order. Null scores stay null.
 */
export function respreadRawScores(
  orderedEntryIds: string[],
  rawByEntryId: Map<string, number | null>,
  options?: { floor?: number; ceiling?: number }
): Map<string, number | null> {
  const floor = options?.floor ?? SPREAD_FLOOR;
  const ceiling = options?.ceiling ?? RAW_CEILING;
  const out = new Map(rawByEntryId);
  const scoredIds = orderedEntryIds.filter(
    (id) => rawByEntryId.get(id) != null
  );
  const n = scoredIds.length;
  if (n === 0) return out;
  const seeds = seedRawFromRankOrder(scoredIds, { floor, ceiling });
  for (const [id, raw] of seeds) {
    out.set(id, raw);
  }
  return out;
}

/** Read-only ordinals 1..k for scored entries (raw desc, stable index tie-break). */
export function partialOrdinalsFromItems(
  items: FinalsScoreItem[]
): Map<string, number> {
  const ranked = items
    .filter((i) => i.raw != null)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRaw = a.item.raw!;
      const bRaw = b.item.raw!;
      if (aRaw !== bRaw) return bRaw - aRaw;
      return a.index - b.index;
    });
  const out = new Map<string, number>();
  ranked.forEach(({ item }, i) => out.set(item.entryId, i + 1));
  return out;
}

export function rankedEntryIds(items: FinalsScoreItem[]): string[] {
  return [...items]
    .filter((i) => i.ordinal != null)
    .sort((a, b) => a.ordinal! - b.ordinal!)
    .map((i) => i.entryId);
}

export function itemsInRankOrder(items: FinalsScoreItem[]): FinalsScoreItem[] {
  return [...items]
    .filter((i) => i.ordinal != null)
    .sort((a, b) => a.ordinal! - b.ordinal!);
}

export function ordinalLabel(n: number): string {
  return `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
}
