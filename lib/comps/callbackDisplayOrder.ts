/** Display order for callback results before a competition is marked complete. */

export interface CallbackDisplayRow {
  roundEntryId: string;
  advanced: boolean;
  alternateRank: number | null;
  rank: number;
}

export interface CallbackDisplayEntry {
  roundEntryId: string;
  bibNumber: number | null;
}

function bibSortKey(
  entryById: Map<string, CallbackDisplayEntry>,
  roundEntryId: string
): number {
  const bib = entryById.get(roundEntryId)?.bibNumber;
  return bib ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Before a comp is closed: advancers by bib, then alternates by A1/A2/A3,
 * then non-advancers by bib. After close: preserve placement (rank) order.
 */
export function orderCallbackRowsForDisplay<
  T extends CallbackDisplayRow,
>(
  ranked: T[],
  entries: CallbackDisplayEntry[],
  byPlacement: boolean
): T[] {
  if (byPlacement) return ranked;

  const entryById = new Map(entries.map((e) => [e.roundEntryId, e]));

  const advanced = ranked.filter((r) => r.advanced);
  const alternates = ranked.filter(
    (r) => !r.advanced && r.alternateRank != null
  );
  const rest = ranked.filter(
    (r) => !r.advanced && r.alternateRank == null
  );

  advanced.sort(
    (a, b) =>
      bibSortKey(entryById, a.roundEntryId) -
      bibSortKey(entryById, b.roundEntryId)
  );
  alternates.sort(
    (a, b) => (a.alternateRank ?? 0) - (b.alternateRank ?? 0)
  );
  rest.sort(
    (a, b) =>
      bibSortKey(entryById, a.roundEntryId) -
      bibSortKey(entryById, b.roundEntryId)
  );

  return [...advanced, ...alternates, ...rest];
}
