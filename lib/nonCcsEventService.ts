import { supabaseServer } from "@/lib/supabaseServer";
import {
  canOrganizerEditStatus,
  parseCommunityPaymentMethods,
  validateCommunityEventSubmit,
  validateCommunityLevels,
  type CommunityPaymentMethod,
} from "@/lib/communityEvents";
import {
  aggregateCompetitionResultsFromRounds,
  hasAnyPublishedResults,
  type AggregatedCompetitionResults,
} from "@/lib/comps/aggregatePublishedResults";
import {
  communityEventPublicTab,
  communityEventSortInstant,
  isCommunityEventPublicPast,
  type PublicCommunityEventListItem,
  type PublicCommunityEventTab,
} from "@/lib/nonCcsPublicEvents";
import {
  buildPublicSlugMap,
  communityEventPublicSlug,
  isUuid,
} from "@/lib/nonCcsEventSlug";

export { canOrganizerEditStatus };

const EVENT_SELECT =
  "id,title,starts_at,ends_at,location,description,time_zone,type,host_kind,approval_status,organizer_profile_id,submitted_at,approval_reviewed_at,approval_rejection_reason,community_payment_methods,community_payment_disclaimer,community_payment_disclaimer_tone,strictly_price,jnj_price,strictly_level,jnj_level,refund_statement";

export async function loadCommunityEventForOrganizer(
  eventId: string,
  userId: string,
  isAdmin: boolean
) {
  const { data, error } = await supabaseServer
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", eventId)
    .eq("host_kind", "community")
    .maybeSingle();
  if (error || !data) return null;
  if (!isAdmin && data.organizer_profile_id !== userId) return null;
  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type, status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return { ...data, competitions: competitions ?? [] };
}

export function validateSubmitPayload(event: {
  title?: string | null;
  starts_at?: string | null;
  location?: string | null;
  community_payment_methods?: unknown;
  competitions?: { id: string }[] | null;
}): string | null {
  return validateCommunityEventSubmit(event);
}

export type CommunityEventPatch = {
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  location?: string;
  description?: string | null;
  time_zone?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  community_payment_methods?: CommunityPaymentMethod[];
  community_payment_disclaimer?: string | null;
  community_payment_disclaimer_tone?: string;
};

export function buildCommunityEventUpdate(
  body: Record<string, unknown>
): { update: Record<string, unknown>; error?: string } {
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") update.title = body.title.trim();
  if (typeof body.starts_at === "string") update.starts_at = body.starts_at;
  if (body.ends_at !== undefined) update.ends_at = body.ends_at || null;
  if (typeof body.location === "string") update.location = body.location.trim();
  if (body.description !== undefined) {
    update.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.time_zone !== undefined) {
    update.time_zone =
      typeof body.time_zone === "string" ? body.time_zone.trim() || null : null;
  }
  if (body.strictly_price !== undefined) {
    update.strictly_price = body.strictly_price ?? null;
  }
  if (body.jnj_price !== undefined) update.jnj_price = body.jnj_price ?? null;
  if (body.strictly_level !== undefined) {
    update.strictly_level = body.strictly_level ?? null;
  }
  if (body.jnj_level !== undefined) update.jnj_level = body.jnj_level ?? null;
  if (body.community_payment_methods !== undefined) {
    update.community_payment_methods = parseCommunityPaymentMethods(
      body.community_payment_methods
    );
  }
  if (body.community_payment_disclaimer !== undefined) {
    const t =
      typeof body.community_payment_disclaimer === "string"
        ? body.community_payment_disclaimer.trim()
        : "";
    update.community_payment_disclaimer = t || null;
  }
  if (body.community_payment_disclaimer_tone !== undefined) {
    const tone = String(body.community_payment_disclaimer_tone);
    if (tone === "warning" || tone === "danger" || tone === "neutral") {
      update.community_payment_disclaimer_tone = tone;
    }
  }

  const levelErr = validateCommunityLevels(
    (update.strictly_level as string | null) ?? undefined,
    (update.jnj_level as string | null) ?? undefined
  );
  if (levelErr) return { update, error: levelErr };

  return { update };
}

export type { PublicCommunityEventListItem } from "@/lib/nonCcsPublicEvents";

export async function listPublicApprovedCommunityEvents() {
  const { data, error } = await supabaseServer
    .from("events")
    .select(
      "id,title,starts_at,ends_at,location,description,time_zone,strictly_price,jnj_price,strictly_level,jnj_level,community_payment_disclaimer,community_payment_disclaimer_tone"
    )
    .eq("host_kind", "community")
    .eq("approval_status", "approved")
    .eq("type", "Comp")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
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

function enrichPublicEventRow(
  event: Record<string, unknown>,
  publishedByEvent: Map<string, AggregatedCompetitionResults[]>,
  slugById: Map<string, string>
): PublicCommunityEventListItem {
  const id = String(event.id);
  const comps = publishedByEvent.get(id) ?? [];
  return {
    id,
    title: String(event.title),
    starts_at: String(event.starts_at),
    ends_at: (event.ends_at as string | null) ?? null,
    location: (event.location as string | null) ?? null,
    description: (event.description as string | null) ?? null,
    time_zone: (event.time_zone as string | null) ?? null,
    strictly_price: (event.strictly_price as number | null) ?? null,
    jnj_price: (event.jnj_price as number | null) ?? null,
    strictly_level: (event.strictly_level as string | null) ?? null,
    jnj_level: (event.jnj_level as string | null) ?? null,
    community_payment_disclaimer:
      (event.community_payment_disclaimer as string | null) ?? null,
    community_payment_disclaimer_tone:
      (event.community_payment_disclaimer_tone as string | null) ?? null,
    tab: communityEventPublicTab({
      starts_at: event.starts_at as string,
      ends_at: event.ends_at as string | null,
      time_zone: event.time_zone as string | null,
    }),
    hasPublishedResults: hasAnyPublishedResults(comps),
    publicSlug: slugById.get(id) ?? communityEventPublicSlug({
      id,
      title: String(event.title),
      starts_at: String(event.starts_at),
      time_zone: event.time_zone as string | null,
    }),
  };
}

/** Resolve public route key (slug or UUID) to event id. */
export async function resolvePublicCommunityEventRouteKey(
  key: string
): Promise<string | null> {
  if (isUuid(key)) {
    const { data } = await supabaseServer
      .from("events")
      .select("id")
      .eq("id", key)
      .eq("host_kind", "community")
      .maybeSingle();
    return data?.id ?? null;
  }

  const events = await listPublicApprovedCommunityEvents();
  const slugMap = buildPublicSlugMap(
    events.map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      time_zone: e.time_zone,
    }))
  );
  for (const e of events) {
    if (slugMap.get(e.id) === key) return e.id;
  }
  return null;
}

export async function publicSlugForCommunityEventId(
  eventId: string
): Promise<string | null> {
  const events = await listPublicApprovedCommunityEvents();
  const match = events.find((e) => e.id === eventId);
  if (!match) return null;
  const slugMap = buildPublicSlugMap(
    events.map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      time_zone: e.time_zone,
    }))
  );
  return slugMap.get(eventId) ?? null;
}

export async function listPublicCommunityEventsHub() {
  const events = await listPublicApprovedCommunityEvents();
  const eventIds = events.map((e) => e.id);
  const slugMap = buildPublicSlugMap(
    events.map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      time_zone: e.time_zone,
    }))
  );
  const rounds = await publishedRoundRowsForEventIds(eventIds);

  const publishedByEvent = new Map<string, AggregatedCompetitionResults[]>();
  for (const eid of eventIds) {
    const comps = aggregateCompetitionResultsFromRounds(rounds as any[], {
      eventId: eid,
      excludeCcs: true,
    });
    publishedByEvent.set(eid, comps);
  }

  const enriched = events.map((e) =>
    enrichPublicEventRow(
      e as Record<string, unknown>,
      publishedByEvent,
      slugMap
    )
  );

  const upcoming = enriched
    .filter((e) => e.tab === "upcoming")
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );

  const past = enriched
    .filter((e) => e.tab === "past")
    .sort(
      (a, b) => communityEventSortInstant(b) - communityEventSortInstant(a)
    );

  return { upcoming, past };
}

export async function buildCommunityEventResultsSummary(
  eventId: string
): Promise<AggregatedCompetitionResults[]> {
  const rounds = await publishedRoundRowsForEventIds([eventId]);
  return aggregateCompetitionResultsFromRounds(rounds as any[], {
    eventId,
    excludeCcs: true,
  });
}

export function publicTabForCommunityEvent(event: {
  starts_at?: string | null;
  ends_at?: string | null;
  time_zone?: string | null;
}): PublicCommunityEventTab {
  return isCommunityEventPublicPast(event) ? "past" : "upcoming";
}

