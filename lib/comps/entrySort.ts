/** Stable sort key: bib ascending (nulls last), then dance order, then id. */
function sortKey(
  bibNumber: number | null | undefined,
  danceOrder: number | null | undefined,
  id: string
): [number, number, string] {
  return [
    bibNumber ?? Number.MAX_SAFE_INTEGER,
    danceOrder ?? Number.MAX_SAFE_INTEGER,
    id,
  ];
}

function compareKeys(a: [number, number, string], b: [number, number, string]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2].localeCompare(b[2]);
}

export function sortByBib<T>(
  items: T[],
  getBib: (item: T) => number | null | undefined,
  getDanceOrder: (item: T) => number | null | undefined,
  getId: (item: T) => string
): T[] {
  return [...items].sort((a, b) =>
    compareKeys(
      sortKey(getBib(a), getDanceOrder(a), getId(a)),
      sortKey(getBib(b), getDanceOrder(b), getId(b))
    )
  );
}

export interface RoundEntryBibSortable {
  id: string;
  dance_order?: number | null;
  display: { bibNumber: number | null };
}

export function sortRoundEntriesByBib<T extends RoundEntryBibSortable>(
  entries: T[]
): T[] {
  return sortByBib(
    entries,
    (e) => e.display.bibNumber,
    (e) => e.dance_order ?? null,
    (e) => e.id
  );
}
