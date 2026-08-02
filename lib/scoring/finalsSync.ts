/**
 * Bidirectional sync between placement mode (drag-to-rank) and raw-score mode
 * (0-100 slider) in the finals judging UI.
 *
 * Invariants: items are kept in placement order (index 0 = 1st place), raw
 * scores are strictly descending, and every raw score is a multiple of 0.1
 * between 0 and 100.
 *
 * Rules (agreed in the plan):
 * - Seeding from placements: 100, 99.9, 99.8, ...
 * - Editing a raw score re-sorts and recomputes every placement instantly;
 *   the edited entry wins ties against the entry it just matched so movement
 *   is deterministic while the judge keeps adjusting.
 * - Drag-to-reorder uses inherit-and-nudge: the moved entry takes the raw
 *   score of the slot it moved into, and displaced entries cascade 0.1 below
 *   as needed to keep a unique descending order (e.g. bib 23 holds 100 in
 *   1st; drag bib 45 to 1st -> 45 gets 100, 23 gets 99.9).
 */

export interface FinalsScoreItem {
  entryId: string;
  /** Raw score 0-100, one decimal; null until the judge sets it. */
  raw: number | null;
}

const STEP = 0.1;

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampScore(value: number): number {
  return roundScore(Math.min(100, Math.max(0, value)));
}

/** Initial raw scores for a placement-first judge: 100, 99.9, 99.8, ... */
export function seedRawFromPlacements(entryIds: string[]): FinalsScoreItem[] {
  return entryIds.map((entryId, i) => ({
    entryId,
    raw: clampScore(100 - i * STEP),
  }));
}

/**
 * Walks the list top-down and pushes any entry that is not strictly below the
 * one above it down to (above - 0.1). Preserves order, fixes uniqueness.
 */
function cascadeDown(items: FinalsScoreItem[]): FinalsScoreItem[] {
  const out = items.map((i) => ({ ...i }));
  for (let i = 1; i < out.length; i++) {
    if (out[i].raw == null || out[i - 1].raw == null) continue;
    const maxAllowed = roundScore(out[i - 1].raw - STEP);
    if (out[i].raw > maxAllowed) {
      out[i].raw = Math.max(0, maxAllowed);
    }
  }
  return out;
}

/**
 * Applies a drag from `fromIndex` to `toIndex` (indexes into the current
 * placement order). Returns the new placement-ordered list.
 */
export function applyReorder(
  items: FinalsScoreItem[],
  fromIndex: number,
  toIndex: number
): FinalsScoreItem[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }
  const inheritedRaw = items[toIndex].raw;
  const next = items.map((i) => ({ ...i }));
  const [moved] = next.splice(fromIndex, 1);
  if (inheritedRaw != null) {
    moved.raw = inheritedRaw;
  }
  next.splice(toIndex, 0, moved);
  return cascadeDown(next);
}

/**
 * Applies a raw-score edit and re-sorts into the new placement order. The
 * edited entry places above any entry it now ties with, so the judge sees a
 * deterministic order and an explicit tie to fix if they stop there.
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
  // Stable sort by raw desc; the edited entry wins exact ties.
  return next
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRaw = a.item.raw ?? -1;
      const bRaw = b.item.raw ?? -1;
      if (aRaw !== bRaw) return bRaw - aRaw;
      if (a.item.entryId === entryId) return -1;
      if (b.item.entryId === entryId) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/** Entry ids involved in any exact raw-score tie (blocks sheet submission). */
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

/** Placement-ordered items -> { entryId: ordinal } map for submission. */
export function toOrdinals(items: FinalsScoreItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  items.forEach((item, i) => {
    out[item.entryId] = i + 1;
  });
  return out;
}
