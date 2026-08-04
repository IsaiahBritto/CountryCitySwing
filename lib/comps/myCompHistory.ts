import type { MeCompHistory } from "@/lib/comps/hubTypes";

export interface CompHistoryEntryInput {
  competitionId: string;
  competitionName: string;
  compType: string;
  eventTitle: string | null;
  eventStartsAt: string | null;
  entryId: string;
  role: "lead" | "follow" | null;
}

export interface FinalsLookup {
  roundId: string;
  tabulation: unknown;
}

export interface RoundEntryLookup {
  roundEntryId: string;
  roundId: string;
  entryId: string;
}

/** Build one history row per competition + role from raw entries. */
export function buildCompHistoryRows(
  entries: CompHistoryEntryInput[],
  finalsByComp: Map<string, FinalsLookup>,
  roundEntries: RoundEntryLookup[],
  placementForRoundEntry: (
    tabulation: unknown,
    roundEntryId: string
  ) => number | null
): MeCompHistory[] {
  const byKey = new Map<string, MeCompHistory>();

  for (const entry of entries) {
    const key = `${entry.competitionId}:${entry.role ?? "unknown"}`;
    if (byKey.has(key)) continue;

    let placement: number | null = null;
    const finals = finalsByComp.get(entry.competitionId);
    if (finals) {
      const re = roundEntries.find(
        (r) => r.roundId === finals.roundId && r.entryId === entry.entryId
      );
      if (re) {
        placement = placementForRoundEntry(finals.tabulation, re.roundEntryId);
      }
    }

    byKey.set(key, {
      competitionId: entry.competitionId,
      competitionName: entry.competitionName,
      compType: entry.compType,
      eventTitle: entry.eventTitle,
      eventStartsAt: entry.eventStartsAt,
      placement,
      role: entry.role,
    });
  }

  return sortCompHistory([...byKey.values()]);
}

/** Newest event first; tie-break by competition name. */
export function sortCompHistory(rows: MeCompHistory[]): MeCompHistory[] {
  return [...rows].sort((a, b) => {
    const aTime = a.eventStartsAt ? new Date(a.eventStartsAt).getTime() : 0;
    const bTime = b.eventStartsAt ? new Date(b.eventStartsAt).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.competitionName.localeCompare(b.competitionName);
  });
}

export function isPastEvent(startsAt: string | null, nowIso: string): boolean {
  if (!startsAt) return false;
  return new Date(startsAt).getTime() < new Date(nowIso).getTime();
}
