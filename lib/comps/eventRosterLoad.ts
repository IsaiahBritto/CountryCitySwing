import { supabaseServer } from "@/lib/supabaseServer";
import {
  collectEventRegistrants,
  type EventJudgeRef,
  type EventRegistrantPerson,
} from "@/lib/comps/eventRegistrants";
import {
  enrichRosterCompetingIn,
  type CompetitionMeta,
  type EventEntryRow,
  type EventLevelMeta,
} from "@/lib/comps/registrantCompLabels";
import type { CompSignupRow } from "@/lib/comps/types";

export async function loadEventJudges(eventId: string): Promise<EventJudgeRef[]> {
  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id")
    .eq("event_id", eventId);
  const compIds = (competitions ?? []).map((c) => c.id as string);
  if (compIds.length === 0) return [];

  const { data: judgeRows, error } = await supabaseServer
    .from("comp_judge_assignments")
    .select("profile_id, profile:profiles(email)")
    .in("competition_id", compIds);
  if (error) throw new Error("Failed to load judges");

  const refs: EventJudgeRef[] = [];
  const seen = new Set<string>();
  for (const row of (judgeRows ?? []) as {
    profile_id?: string | null;
    profile?: { email?: string | null } | null;
  }[]) {
    const profileId = row.profile_id?.trim() || null;
    const email =
      typeof row.profile?.email === "string"
        ? row.profile.email.trim().toLowerCase()
        : null;
    const key = profileId ?? email ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    refs.push({ profileId, email });
  }
  return refs;
}

async function loadEventEntriesAndCompetitions(eventId: string): Promise<{
  competitions: CompetitionMeta[];
  entries: EventEntryRow[];
}> {
  const { data: competitions, error: compErr } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type")
    .eq("event_id", eventId);

  if (compErr) throw new Error("Failed to load competitions");

  const compList = (competitions ?? []) as CompetitionMeta[];
  const compIds = compList.map((c) => c.id);
  if (compIds.length === 0) {
    return { competitions: compList, entries: [] };
  }

  const { data: entryRows, error: entryErr } = await supabaseServer
    .from("comp_entries")
    .select(
      "id, competition_id, entry_kind, role, lead_first_name, lead_last_name, lead_email, lead_profile_id, follow_first_name, follow_last_name, follow_email, follow_profile_id, comp_signup_id, source_lead_entry_id"
    )
    .in("competition_id", compIds);

  if (entryErr) throw new Error("Failed to load entries");

  return {
    competitions: compList,
    entries: (entryRows ?? []) as EventEntryRow[],
  };
}

async function loadEventCompLevels(eventId: string): Promise<EventLevelMeta> {
  const { data } = await supabaseServer
    .from("events")
    .select("jnj_level, strictly_level")
    .eq("id", eventId)
    .maybeSingle();
  return {
    jnj_level: (data?.jnj_level as string | null) ?? null,
    strictly_level: (data?.strictly_level as string | null) ?? null,
  };
}

/** Signups + bibs roster with competingIn from comp_entries. */
export async function loadEventRosterWithLabels(
  eventId: string
): Promise<EventRegistrantPerson[]> {
  const [signupsRes, bibsRes, judges, { competitions, entries }, levels] =
    await Promise.all([
      supabaseServer.from("comp_signups").select("*").eq("event_id", eventId),
      supabaseServer
        .from("comp_bibs")
        .select("id, first_name, last_name, email, profile_id, bib_number")
        .eq("event_id", eventId),
      loadEventJudges(eventId),
      loadEventEntriesAndCompetitions(eventId),
      loadEventCompLevels(eventId),
    ]);

  if (signupsRes.error) throw new Error("Failed to load signups");
  if (bibsRes.error) throw new Error("Failed to load bibs");

  const roster = collectEventRegistrants(
    (signupsRes.data ?? []) as CompSignupRow[],
    bibsRes.data ?? [],
    { judges }
  );

  return enrichRosterCompetingIn(roster, entries, competitions, levels);
}
