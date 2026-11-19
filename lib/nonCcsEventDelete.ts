import {
  aggregateCompetitionResultsFromRounds,
  hasAnyPublishedResults,
} from "@/lib/comps/aggregatePublishedResults";
import {
  deleteEligibilityFromChecks,
  type CommunityEventDeleteEligibility,
} from "@/lib/nonCcsEventDeleteEligibility";
import { pruneOrphanBibsForCommunityEvent } from "@/lib/comps/pruneEventBibs";
import { eventHasNonTestRegistrants } from "@/lib/comps/testRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";
import { buildCommunityEventResultsSummary } from "@/lib/nonCcsEventService";
import { supabaseServer } from "@/lib/supabaseServer";

export type { CommunityEventDeleteEligibility };
export { deleteEligibilityFromChecks };

type EventBibRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  profile_id: string | null;
  bib_number: number | null;
};

async function loadActiveCompSignupsForEvent(
  eventId: string
): Promise<CompSignupRow[]> {
  const { data, error } = await supabaseServer
    .from("comp_signups")
    .select("*")
    .eq("event_id", eventId)
    .neq("refunded_or_cancelled", "cancelled");
  if (error) throw error;
  return (data ?? []) as CompSignupRow[];
}

async function loadEventBibs(eventId: string): Promise<EventBibRow[]> {
  const { data, error } = await supabaseServer
    .from("comp_bibs")
    .select("id, first_name, last_name, email, profile_id, bib_number")
    .eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []) as EventBibRow[];
}

/** Organizer delete eligibility for a single community event. */
export async function communityEventDeleteEligibility(
  eventId: string
): Promise<CommunityEventDeleteEligibility> {
  const [resultsSummary, signups, bibs] = await Promise.all([
    buildCommunityEventResultsSummary(eventId),
    loadActiveCompSignupsForEvent(eventId),
    loadEventBibs(eventId),
  ]);
  const published = hasAnyPublishedResults(resultsSummary);
  if (signups.length === 0) {
    await pruneOrphanBibsForCommunityEvent(eventId);
  }
  const hasNonTestRegistrants = eventHasNonTestRegistrants(signups, bibs);
  return deleteEligibilityFromChecks({
    signupCount: signups.length,
    hasPublishedResults: published,
    hasNonTestRegistrants,
  });
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

  const [signupsRes, bibsRes] = await Promise.all([
    supabaseServer
      .from("comp_signups")
      .select("*")
      .in("event_id", eventIds)
      .neq("refunded_or_cancelled", "cancelled"),
    supabaseServer
      .from("comp_bibs")
      .select("id, event_id, first_name, last_name, email, profile_id, bib_number")
      .in("event_id", eventIds),
  ]);
  if (signupsRes.error) throw signupsRes.error;
  if (bibsRes.error) throw bibsRes.error;

  const signupsByEvent = new Map<string, CompSignupRow[]>();
  const bibsByEvent = new Map<string, EventBibRow[]>();
  for (const id of eventIds) {
    signupsByEvent.set(id, []);
    bibsByEvent.set(id, []);
  }
  for (const row of signupsRes.data ?? []) {
    const eid = String(row.event_id);
    const list = signupsByEvent.get(eid);
    if (list) list.push(row as CompSignupRow);
  }
  for (const row of bibsRes.data ?? []) {
    const eid = String(row.event_id);
    const list = bibsByEvent.get(eid);
    if (list) {
      list.push({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        profile_id: row.profile_id,
        bib_number: row.bib_number,
      });
    }
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
    const signups = signupsByEvent.get(id) ?? [];
    const bibs = bibsByEvent.get(id) ?? [];
    out.set(
      id,
      deleteEligibilityFromChecks({
        signupCount: signups.length,
        hasPublishedResults: publishedByEvent.get(id) ?? false,
        hasNonTestRegistrants: eventHasNonTestRegistrants(signups, bibs),
      })
    );
  }
  return out;
}