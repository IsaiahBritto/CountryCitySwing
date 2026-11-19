import {
  aggregateCompetitionResultsFromRounds,
  hasAnyPublishedResults,
} from "@/lib/comps/aggregatePublishedResults";
import {
  deleteEligibilityFromChecks,
  type CommunityEventDeleteEligibility,
} from "@/lib/nonCcsEventDeleteEligibility";
import { buildCommunityEventResultsSummary } from "@/lib/nonCcsEventService";
import { supabaseServer } from "@/lib/supabaseServer";

export type { CommunityEventDeleteEligibility };
export { deleteEligibilityFromChecks };

async function compSignupCountForEvent(eventId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("comp_signups")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw error;
  return count ?? 0;
}

/** Organizer delete eligibility for a single community event. */
export async function communityEventDeleteEligibility(
  eventId: string
): Promise<CommunityEventDeleteEligibility> {
  const [resultsSummary, signupCount] = await Promise.all([
    buildCommunityEventResultsSummary(eventId),
    compSignupCountForEvent(eventId),
  ]);
  const published = hasAnyPublishedResults(resultsSummary);
  return deleteEligibilityFromChecks({ signupCount, hasPublishedResults: published });
}

async function publishedRoundRowsForEventIds(eventIds: string[]) {
  if (eventIds.length === 0) return [];
  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id, event_id")
    .in("event_id", eventIds);
  const compIds = (competitions ?? []).map((c) => c.id);
  if (compIds.length === 0) return [];

  const { data: rounds, error } = await supabaseServer
    .from("comp_rounds")
    .select(
      "competition_id, round_type, judged_role, scoring_mode, published_at, tabulation, competition:competitions(id, name, comp_type, test_comp, event_id, event:events(id, host_kind))"
    )
    .in("competition_id", compIds)
    .eq("status", "published");
  if (error) throw error;
  return rounds ?? [];
}

/** Batch delete eligibility for organizer event list. */
export async function communityEventDeleteEligibilityBatch(
  eventIds: string[]
): Promise<Map<string, CommunityEventDeleteEligibility>> {
  const out = new Map<string, CommunityEventDeleteEligibility>();
  if (eventIds.length === 0) return out;

  const { data: signupRows, error: signupErr } = await supabaseServer
    .from("comp_signups")
    .select("event_id")
    .in("event_id", eventIds);
  if (signupErr) throw signupErr;

  const signupCountByEvent = new Map<string, number>();
  for (const id of eventIds) signupCountByEvent.set(id, 0);
  for (const row of signupRows ?? []) {
    const eid = String(row.event_id);
    signupCountByEvent.set(eid, (signupCountByEvent.get(eid) ?? 0) + 1);
  }

  const rounds = await publishedRoundRowsForEventIds(eventIds);
  const publishedByEvent = new Map<string, boolean>();
  for (const id of eventIds) publishedByEvent.set(id, false);

  for (const eid of eventIds) {
    const aggregated = aggregateCompetitionResultsFromRounds(rounds as any[], {
      eventId: eid,
      excludeCcs: true,
    });
    publishedByEvent.set(eid, hasAnyPublishedResults(aggregated));
  }

  for (const id of eventIds) {
    out.set(
      id,
      deleteEligibilityFromChecks({
        signupCount: signupCountByEvent.get(id) ?? 0,
        hasPublishedResults: publishedByEvent.get(id) ?? false,
      })
    );
  }
  return out;
}