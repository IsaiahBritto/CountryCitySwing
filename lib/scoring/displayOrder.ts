/**
 * Display-order helpers for judge scoring sheets (Bib Order vs Scoring Order).
 */

import { sortByBib } from "@/lib/comps/entrySort";

export type DisplayOrder = "bib" | "score";

export interface DisplaySortable {
  entryId: string;
  bibNumber: number | null;
  danceOrder?: number | null;
  raw: number | null;
  ordinal?: number | null;
}

export function sortForDisplayOrder<T extends DisplaySortable>(
  items: T[],
  order: DisplayOrder,
  mode: "placement" | "raw" = "raw"
): T[] {
  if (order === "bib") {
    return sortByBib(
      items,
      (i) => i.bibNumber,
      (i) => i.danceOrder ?? null,
      (i) => i.entryId
    );
  }
  if (mode === "placement") {
    return [...items].sort((a, b) => {
      const aOrd = a.ordinal ?? Number.MAX_SAFE_INTEGER;
      const bOrd = b.ordinal ?? Number.MAX_SAFE_INTEGER;
      if (aOrd !== bOrd) return aOrd - bOrd;
      const aBib = a.bibNumber ?? Number.MAX_SAFE_INTEGER;
      const bBib = b.bibNumber ?? Number.MAX_SAFE_INTEGER;
      if (aBib !== bBib) return aBib - bBib;
      return a.entryId.localeCompare(b.entryId);
    });
  }
  return [...items].sort((a, b) => {
    const aRaw = a.raw ?? -1;
    const bRaw = b.raw ?? -1;
    if (aRaw !== bRaw) return bRaw - aRaw;
    const aBib = a.bibNumber ?? Number.MAX_SAFE_INTEGER;
    const bBib = b.bibNumber ?? Number.MAX_SAFE_INTEGER;
    if (aBib !== bBib) return aBib - bBib;
    return a.entryId.localeCompare(b.entryId);
  });
}

/** @deprecated Use item.ordinal on FinalsScoreItem directly. */
export function placementForEntry(
  items: { entryId: string; ordinal?: number | null }[],
  entryId: string
): number | null {
  const item = items.find((i) => i.entryId === entryId);
  return item?.ordinal ?? null;
}
