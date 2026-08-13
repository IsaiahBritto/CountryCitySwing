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

/** Average of two scores, rounded to one decimal. */
export function midpointScore(a: number, b: number): number {
  return roundScore((a + b) / 2);
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
      above = nudgeAbove;
      used.delete(aboveRaw);
      used.add(nudgeAbove);
    } else if (below - NUDGE_STEP >= SLOT_MIN_RAW) {
      nudgeBelow = clampScore(below - NUDGE_STEP);
      below = nudgeBelow;
      used.delete(belowRaw);
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
      used.delete(belowRaw);
      used.add(nudgeBelow);
      raw = RAW_CEILING;
    }
  } else if (above != null && below == null) {
    raw = roundScore(above - NUDGE_STEP);
    raw = Math.max(raw, SLOT_MIN_RAW);
    if (raw >= above) {
      nudgeAbove = clampScore(above + NUDGE_STEP);
      above = nudgeAbove;
      used.delete(aboveRaw);
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
 * Swaps ordinals with a target row and adjusts only the moved entry's raw
 * to fit between unchanged neighbor scores at the new rank.
 */
export function reorderMovedEntry(
  items: FinalsScoreItem[],
  movedEntryId: string,
  swapWithEntryId: string
): FinalsScoreItem[] {
  const next = items.map((i) => ({ ...i }));
  const moved = next.find((i) => i.entryId === movedEntryId);
  const partner = next.find((i) => i.entryId === swapWithEntryId);
  if (!moved || !partner || moved.ordinal == null || partner.ordinal == null) {
    return items;
  }
  if (moved.ordinal === partner.ordinal || moved.raw == null) return items;

  const snapshot = new Map(
    next
      .filter((i) => i.raw != null)
      .map((i) => [i.entryId, i.raw!] as const)
  );
  const lastRank = next.filter((i) => i.ordinal != null).length;

  const tmp = moved.ordinal;
  moved.ordinal = partner.ordinal;
  partner.ordinal = tmp;

  const newRank = moved.ordinal!;
  const aboveEntry = next.find((i) => i.ordinal === newRank - 1);
  const belowEntry = next.find((i) => i.ordinal === newRank + 1);

  const aboveRaw = aboveEntry ? (snapshot.get(aboveEntry.entryId) ?? null) : null;
  const belowRaw = belowEntry ? (snapshot.get(belowEntry.entryId) ?? null) : null;

  let candidate: number;
  if (newRank === 1) {
    candidate =
      belowRaw != null
        ? midpointScore(RAW_CEILING, belowRaw)
        : RAW_CEILING;
  } else if (newRank === lastRank) {
    candidate =
      aboveRaw != null
        ? Math.max(roundScore(aboveRaw - NUDGE_STEP), SLOT_MIN_RAW)
        : SLOT_MIN_RAW;
  } else {
    candidate = midpointScore(aboveRaw!, belowRaw!);
  }

  const { raw, nudgeAbove, nudgeBelow } = fitRawInSlot(
    candidate,
    newRank === 1 ? null : aboveRaw,
    newRank === lastRank ? null : belowRaw,
    snapshot,
    movedEntryId
  );

  moved.raw = raw;
  if (nudgeAbove != null && aboveEntry) {
    aboveEntry.raw = nudgeAbove;
  }
  if (nudgeBelow != null && belowEntry) {
    belowEntry.raw = nudgeBelow;
  }

  return next;
}

/** @deprecated Use reorderMovedEntry — pass the row being moved as the first id. */
export function reorderRankedAndSeedAll(
  items: FinalsScoreItem[],
  movedEntryId: string,
  swapWithEntryId: string
): FinalsScoreItem[] {
  return reorderMovedEntry(items, movedEntryId, swapWithEntryId);
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
