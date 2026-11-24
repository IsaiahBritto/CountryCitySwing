import { extractPodium, type PodiumEntry } from "@/lib/comps/podium";

export type AggregatedCompetitionResults = {
  id: string;
  name: string;
  comp_type: string;
  test_comp: boolean;
  publishedRounds: number;
  podium: PodiumEntry[] | null;
  latestPublishedAt: string | null;
};

export type PublishedRoundRow = {
  round_type: string;
  judged_role?: string | null;
  scoring_mode?: string | null;
  published_at?: string | null;
  tabulation?: unknown;
  competition_id?: string;
  competition?: {
    id: string;
    name: string;
    comp_type: string;
    test_comp?: boolean;
    event_id?: string;
    event?: { id: string; host_kind?: string | null };
  } | null;
};

/**
 * Build per-competition result summaries from published round rows (hub / non-CCS).
 */
export function aggregateCompetitionResultsFromRounds(
  rounds: PublishedRoundRow[],
  opts?: {
    includeTest?: boolean;
    eventId?: string;
    excludeCommunity?: boolean;
    excludeCcs?: boolean;
  }
): AggregatedCompetitionResults[] {
  const includeTest = opts?.includeTest ?? false;
  const byComp = new Map<string, AggregatedCompetitionResults>();

  for (const round of rounds) {
    const comp = round.competition;
    if (!comp?.id) continue;
    if (!includeTest && comp.test_comp) continue;
    const host = comp.event?.host_kind ?? "ccs";
    if (opts?.excludeCommunity && host === "community") continue;
    if (opts?.excludeCcs && host !== "community") continue;
    if (opts?.eventId && comp.event?.id !== opts.eventId && comp.event_id !== opts.eventId) {
      const compEventId = comp.event?.id ?? comp.event_id;
      if (compEventId !== opts.eventId) continue;
    }

    let entry = byComp.get(comp.id);
    if (!entry) {
      entry = {
        id: comp.id,
        name: comp.name,
        comp_type: comp.comp_type,
        test_comp: comp.test_comp ?? false,
        publishedRounds: 0,
        podium: null,
        latestPublishedAt: null,
      };
      byComp.set(comp.id, entry);
    }

    entry.publishedRounds++;
    const pubAt = round.published_at ?? null;
    if (
      pubAt &&
      (!entry.latestPublishedAt || pubAt > entry.latestPublishedAt)
    ) {
      entry.latestPublishedAt = pubAt;
    }

    if (
      round.round_type === "final" &&
      round.scoring_mode === "relative_placement" &&
      entry.podium == null
    ) {
      entry.podium = extractPodium(round.tabulation);
    }
  }

  return [...byComp.values()];
}

export function hasAnyPublishedResults(
  competitions: AggregatedCompetitionResults[]
): boolean {
  return competitions.some((c) => c.publishedRounds > 0);
}