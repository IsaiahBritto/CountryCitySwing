import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { placementForRoundEntry } from "@/lib/comps/podium";
import {
  buildCompHistoryRows,
  isPastEvent,
  type CompHistoryEntryInput,
} from "@/lib/comps/myCompHistory";

async function getUserFromToken(accessToken: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
  const { data, error } = await client.auth.getUser(accessToken);
  return { user: data?.user ?? null, error };
}

/**
 * GET: signed-in competitor's upcoming registrations and competition history.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const { user, error: authError } = await getUserFromToken(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = user.id;
  const nowIso = new Date().toISOString();

  const { data: signups, error: signupError } = await supabaseServer
    .from("comp_signups")
    .select(
      "id, event_id, strictly_selected, jnj_selected, registrant_profile_id, strictly_lead_profile_id, strictly_follow_profile_id, jnj_lead_profile_id, jnj_follow_profile_id, event:events(id, title, starts_at, location, type, test_event)"
    )
    .or(
      `registrant_profile_id.eq.${profileId},strictly_lead_profile_id.eq.${profileId},strictly_follow_profile_id.eq.${profileId},jnj_lead_profile_id.eq.${profileId},jnj_follow_profile_id.eq.${profileId}`
    );

  if (signupError) {
    console.error("[comps/me] signups failed", signupError);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  const upcomingSignups = ((signups ?? []) as any[]).filter((s) => {
    if (s.event?.test_event) return false;
    const starts = s.event?.starts_at;
    if (!starts) return false;
    return new Date(starts).getTime() >= new Date(nowIso).getTime();
  });

  const eventIds = [...new Set(upcomingSignups.map((s) => s.event_id).filter(Boolean))];
  let bibByEvent = new Map<string, number>();
  if (eventIds.length > 0) {
    const { data: bibs } = await supabaseServer
      .from("comp_bibs")
      .select("event_id, bib_number")
      .eq("profile_id", profileId)
      .in("event_id", eventIds);
    for (const b of bibs ?? []) {
      bibByEvent.set(b.event_id, b.bib_number);
    }
  }

  const upcoming = upcomingSignups.map((s) => {
    const divisions: {
      division: "strictly" | "jack_and_jill";
      role: "lead" | "follow" | null;
    }[] = [];
    if (s.strictly_selected) {
      let role: "lead" | "follow" | null = null;
      if (s.strictly_lead_profile_id === profileId) role = "lead";
      else if (s.strictly_follow_profile_id === profileId) role = "follow";
      divisions.push({ division: "strictly", role });
    }
    if (s.jnj_selected) {
      let role: "lead" | "follow" | null = null;
      if (s.jnj_lead_profile_id === profileId) role = "lead";
      else if (s.jnj_follow_profile_id === profileId) role = "follow";
      divisions.push({ division: "jack_and_jill", role });
    }
    return {
      signupId: s.id,
      eventId: s.event_id,
      event: s.event
        ? {
            id: s.event.id,
            title: s.event.title,
            starts_at: s.event.starts_at,
            location: s.event.location,
          }
        : null,
      bibNumber: bibByEvent.get(s.event_id) ?? null,
      divisions,
    };
  });

  const { data: entries, error: entriesError } = await supabaseServer
    .from("comp_entries")
    .select(
      "id, competition_id, lead_profile_id, follow_profile_id, competition:competitions(id, name, comp_type, test_comp, event:events(id, title, starts_at))"
    )
    .or(`lead_profile_id.eq.${profileId},follow_profile_id.eq.${profileId}`);

  if (entriesError) {
    console.error("[comps/me] entries failed", entriesError);
    return NextResponse.json({ error: "Failed to load competition history" }, { status: 500 });
  }

  const pastEntryInputs: CompHistoryEntryInput[] = [];
  for (const entry of (entries ?? []) as any[]) {
    if (entry.competition?.test_comp) continue;
    const eventStartsAt = entry.competition?.event?.starts_at ?? null;
    if (!isPastEvent(eventStartsAt, nowIso)) continue;

    let role: "lead" | "follow" | null = null;
    if (entry.lead_profile_id === profileId) role = "lead";
    else if (entry.follow_profile_id === profileId) role = "follow";

    pastEntryInputs.push({
      competitionId: entry.competition_id,
      competitionName: entry.competition?.name ?? "Competition",
      compType: entry.competition?.comp_type ?? "",
      eventTitle: entry.competition?.event?.title ?? null,
      eventStartsAt,
      entryId: entry.id,
      role,
    });
  }

  const competitionIds = [
    ...new Set(pastEntryInputs.map((e) => e.competitionId)),
  ];

  let history = buildCompHistoryRows(pastEntryInputs, new Map(), [], () => null);

  if (competitionIds.length > 0) {
    const { data: finals } = await supabaseServer
      .from("comp_rounds")
      .select("id, competition_id, tabulation, status")
      .in("competition_id", competitionIds)
      .eq("round_type", "final")
      .is("judged_role", null)
      .eq("status", "published");

    const finalsByComp = new Map(
      ((finals ?? []) as any[]).map((r) => [
        r.competition_id,
        { roundId: r.id as string, tabulation: r.tabulation },
      ])
    );

    const finalRoundIds = ((finals ?? []) as any[]).map((r) => r.id);
    let roundEntries: { id: string; round_id: string; entry_id: string }[] = [];
    if (finalRoundIds.length > 0) {
      const entryIds = pastEntryInputs.map((e) => e.entryId);
      const { data: re } = await supabaseServer
        .from("comp_round_entries")
        .select("id, round_id, entry_id")
        .in("round_id", finalRoundIds)
        .in("entry_id", entryIds);
      roundEntries = (re ?? []) as any[];
    }

    history = buildCompHistoryRows(
      pastEntryInputs,
      finalsByComp,
      roundEntries.map((r) => ({
        roundEntryId: r.id,
        roundId: r.round_id,
        entryId: r.entry_id,
      })),
      placementForRoundEntry
    );
  }

  return NextResponse.json({ upcoming, history });
}
