/**
 * All finals placements from a relative-placement tabulation snapshot.
 */

export interface FinalsPlacementEntry {
  placement: number;
  roundEntryId: string;
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

/** Every finisher with a placement, sorted 1 → N. */
export function listFinalsPlacements(tabulation: unknown): FinalsPlacementEntry[] {
  if (!tabulation || typeof tabulation !== "object") return [];
  const t = tabulation as RpTabulationLike;
  if (t.mode !== "relative_placement" || !Array.isArray(t.grid) || !Array.isArray(t.entries)) {
    return [];
  }

  const entryById = new Map(t.entries.map((e) => [e.roundEntryId, e]));

  return t.grid
    .filter((row) => row.placement != null && row.placement >= 1)
    .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999))
    .map((row) => {
      const entry = entryById.get(row.roundEntryId);
      return {
        placement: row.placement!,
        roundEntryId: row.roundEntryId,
        displayName: entry?.displayName ?? "Unknown",
        bibNumber: entry?.bibNumber ?? null,
      };
    });
}

export function ordinalPlacementLabel(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}
