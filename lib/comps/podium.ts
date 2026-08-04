/**
 * Extract top-3 podium from a published finals relative-placement tabulation.
 */

export interface PodiumEntry {
  placement: number;
  displayName: string;
  bibNumber: number | null;
}

type RpTabulationLike = {
  mode?: string;
  entries?: { roundEntryId: string; bibNumber: number | null; displayName: string }[];
  grid?: {
    roundEntryId: string;
    placement: number | null;
  }[];
};

/** Top 3 placements from a finals tabulation snapshot; null if unavailable. */
export function extractPodium(tabulation: unknown): PodiumEntry[] | null {
  if (!tabulation || typeof tabulation !== "object") return null;
  const t = tabulation as RpTabulationLike;
  if (t.mode !== "relative_placement" || !Array.isArray(t.grid) || !Array.isArray(t.entries)) {
    return null;
  }

  const entryById = new Map(
    t.entries.map((e) => [e.roundEntryId, e])
  );

  const ranked = t.grid
    .filter((row) => row.placement != null && row.placement >= 1 && row.placement <= 3)
    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));

  if (ranked.length === 0) return null;

  const podium: PodiumEntry[] = [];
  for (const row of ranked) {
    if (row.placement == null) continue;
    const entry = entryById.get(row.roundEntryId);
    if (!entry) continue;
    podium.push({
      placement: row.placement,
      displayName: entry.displayName,
      bibNumber: entry.bibNumber,
    });
  }

  return podium.length > 0 ? podium : null;
}

/** Placement for a specific round entry id from a finals tabulation. */
export function placementForRoundEntry(
  tabulation: unknown,
  roundEntryId: string
): number | null {
  if (!tabulation || typeof tabulation !== "object") return null;
  const t = tabulation as RpTabulationLike;
  if (!Array.isArray(t.grid)) return null;
  const row = t.grid.find((g) => g.roundEntryId === roundEntryId);
  return row?.placement ?? null;
}
