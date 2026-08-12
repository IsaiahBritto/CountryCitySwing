/**
 * Finals judging sync: raw scores drive partial ordinals during scoring;
 * verify step finalizes full 1..N ranking and reseeds raw on reorder.
 */

export interface FinalsScoreItem {
  entryId: string;
  /** Placement 1..N; null until ranked (partial during scoring). */
  ordinal: number | null;
  /** Raw score 0-100, one decimal; null until set. */
  raw: number | null;
}

const RAW_FLOOR = 20;
const RAW_CEILING = 100;

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampScore(value: number): number {
  return roundScore(Math.min(100, Math.max(0, value)));
}

/** Assigns raw 100→floor for every id in rank order (all receive a score). */
export function seedRawFromRankOrder(
  orderedEntryIds: string[],
  options?: { floor?: number; ceiling?: number }
): Map<string, number> {
  const floor = options?.floor ?? RAW_FLOOR;
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

/** Swap two fully-ranked entries and reseed raw for all N couples. */
export function reorderRankedAndSeedAll(
  items: FinalsScoreItem[],
  entryIdA: string,
  entryIdB: string
): FinalsScoreItem[] {
  const next = items.map((i) => ({ ...i }));
  const a = next.find((i) => i.entryId === entryIdA);
  const b = next.find((i) => i.entryId === entryIdB);
  if (!a || !b || a.ordinal == null || b.ordinal == null) return items;

  const tmp = a.ordinal;
  a.ordinal = b.ordinal;
  b.ordinal = tmp;

  return reseedAllRawFromOrdinals(next);
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
  const floor = options?.floor ?? RAW_FLOOR;
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
