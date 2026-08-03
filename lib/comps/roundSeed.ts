import { supabaseServer } from "@/lib/supabaseServer";
import { sortByBib } from "@/lib/comps/entrySort";
import type { CompType, DanceRole, RoundType } from "@/lib/comps/types";
import {
  findNextEnabledRound,
  findPreviousEnabledRound,
  getSlotLabel,
  isFirstEnabledSlot,
  isRoundFinalized,
  resolveJnJFinalsSourceRounds,
  type RoundSlotRef,
} from "@/lib/comps/roundChain";
import { JnJFinalsSeedError } from "@/lib/comps/jnjFinalsSeedHelpers";
export {
  JnJFinalsSeedError,
  isJnJFinalsRound,
  needsJnJFinalsReseed,
} from "@/lib/comps/jnjFinalsSeedHelpers";

export async function resolveEntryIdsForRound(
  competitionId: string,
  compType: CompType,
  roundType: RoundType,
  judgedRole: DanceRole | null,
  allRounds: RoundSlotRef[],
  explicitSourceRoundId?: string | null
): Promise<{ entryIds: string[]; sourceRoundId: string | null }> {
  const firstSlot = isFirstEnabledSlot(allRounds, roundType);

  if (firstSlot) {
    const { data: entries } = await supabaseServer
      .from("comp_entries")
      .select("id, entry_kind, role")
      .eq("competition_id", competitionId);
    const wantCouples =
      compType === "strictly" || (roundType === "final" && !judgedRole);
    const entryIds = (entries ?? [])
      .filter((e) =>
        wantCouples
          ? e.entry_kind === "couple"
          : e.entry_kind === "individual" &&
            (!judgedRole || e.role === judgedRole)
      )
      .map((e) => e.id);
    return { entryIds, sourceRoundId: null };
  }

  const sourceRound =
    explicitSourceRoundId != null
      ? allRounds.find((r) => r.id === explicitSourceRoundId) ?? null
      : findPreviousEnabledRound(allRounds, roundType, judgedRole);

  if (!sourceRound) {
    return { entryIds: [], sourceRoundId: null };
  }

  const { data: results } = await supabaseServer
    .from("comp_round_results")
    .select("advanced, round_entry:comp_round_entries(entry_id)")
    .eq("round_id", sourceRound.id)
    .eq("advanced", true);

  const entryIds = ((results ?? []) as any[])
    .map((r) => r.round_entry?.entry_id)
    .filter(Boolean) as string[];

  return { entryIds, sourceRoundId: sourceRound.id };
}

export async function seedRoundEntries(
  roundId: string,
  entryIds: string[]
): Promise<void> {
  await supabaseServer
    .from("comp_round_entries")
    .delete()
    .eq("round_id", roundId);

  if (entryIds.length === 0) return;

  const { error } = await supabaseServer.from("comp_round_entries").insert(
    entryIds.map((entryId, i) => ({
      round_id: roundId,
      entry_id: entryId,
      dance_order: i + 1,
    }))
  );
  if (error) {
    throw new Error("Failed to seed round entries");
  }
}

async function loadAdvancers(roundId: string, competitionId: string) {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status, judged_role, competition_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || round.competition_id !== competitionId) {
    throw new JnJFinalsSeedError("Source round not found");
  }
  if (!isRoundFinalized(round.status)) {
    throw new JnJFinalsSeedError(
      `${round.judged_role === "lead" ? "Leads" : "Follows"} source round must be tabulated before seeding finals`
    );
  }
  const { data: results } = await supabaseServer
    .from("comp_round_results")
    .select(
      "advanced, round_entry:comp_round_entries(entry_id, entry:comp_entries(*, lead_bib:comp_bibs!comp_entries_lead_bib_id_fkey(bib_number), follow_bib:comp_bibs!comp_entries_follow_bib_id_fkey(bib_number)))"
    )
    .eq("round_id", roundId)
    .eq("advanced", true);
  return {
    judgedRole: round.judged_role,
    entries: ((results ?? []) as any[])
      .map((r) => r.round_entry?.entry)
      .filter(Boolean),
  };
}

/**
 * Seed JnJ finals with individual lead/follow advancers from the previous
 * enabled callback slot (or explicit source round ids). Sets checkin_role.
 */
export async function seedJnJFinalsFromAdvancers(
  competitionId: string,
  finalsRoundId: string,
  allRounds: RoundSlotRef[],
  options?: { leadRoundId?: string; followRoundId?: string }
): Promise<{
  leads: number;
  follows: number;
  leadSourceId: string;
  followSourceId: string;
}> {
  let leadRoundId = options?.leadRoundId;
  let followRoundId = options?.followRoundId;

  if (!leadRoundId || !followRoundId) {
    const sources = resolveJnJFinalsSourceRounds(allRounds);
    if (!sources) {
      throw new JnJFinalsSeedError(
        "No previous callback slot with both lead and follow rounds found. Enable and tabulate the prior round before beginning finals check-in."
      );
    }
    if (
      !isRoundFinalized(sources.leadRound.status) ||
      !isRoundFinalized(sources.followRound.status)
    ) {
      throw new JnJFinalsSeedError(
        `Finalize ${getSlotLabel(sources.slotType)} (leads and follows) before beginning finals check-in`
      );
    }
    leadRoundId = sources.leadRound.id;
    followRoundId = sources.followRound.id;
  }

  const [leads, follows] = await Promise.all([
    loadAdvancers(leadRoundId, competitionId),
    loadAdvancers(followRoundId, competitionId),
  ]);

  if (leads.judgedRole !== "lead" || follows.judgedRole !== "follow") {
    throw new JnJFinalsSeedError(
      "Source rounds must be the leads and follows callback rounds respectively"
    );
  }
  if (leads.entries.length !== follows.entries.length) {
    throw new JnJFinalsSeedError(
      `Lead and follow counts differ (${leads.entries.length} vs ${follows.entries.length}); promote alternates or adjust before seeding finals`
    );
  }
  if (leads.entries.length === 0) {
    throw new JnJFinalsSeedError("No advancers to seed for finals");
  }

  const sortedLeads = sortByBib(
    leads.entries,
    (e: any) => e.lead_bib?.bib_number ?? null,
    () => 0,
    (e: any) => e.id
  );
  const sortedFollows = sortByBib(
    follows.entries,
    (e: any) => e.follow_bib?.bib_number ?? null,
    () => 0,
    (e: any) => e.id
  );

  await supabaseServer
    .from("comp_round_entries")
    .delete()
    .eq("round_id", finalsRoundId);

  const seedRows = [
    ...sortedLeads.map((entry: any, i: number) => ({
      round_id: finalsRoundId,
      entry_id: entry.id,
      dance_order: i + 1,
      checkin_role: "lead" as const,
    })),
    ...sortedFollows.map((entry: any, i: number) => ({
      round_id: finalsRoundId,
      entry_id: entry.id,
      dance_order: i + 1,
      checkin_role: "follow" as const,
    })),
  ];

  const { error: entriesError } = await supabaseServer
    .from("comp_round_entries")
    .insert(seedRows);
  if (entriesError) {
    throw new Error("Failed to seed finals entries");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseServer
    .from("comp_rounds")
    .update({
      source_round_id: leadRoundId,
      rotation_offset: null,
      pairings_confirmed_at: null,
      updated_at: now,
    })
    .eq("id", finalsRoundId);
  if (updateError) {
    throw new Error("Failed to update finals round");
  }

  return {
    leads: sortedLeads.length,
    follows: sortedFollows.length,
    leadSourceId: leadRoundId,
    followSourceId: followRoundId,
  };
}

/** After tabulation, refresh pending next-slot entries from advancers. */
export async function reseedNextPendingSlots(
  competitionId: string,
  compType: CompType,
  tabulatedRound: RoundSlotRef,
  allRounds: RoundSlotRef[]
): Promise<void> {
  const next = findNextEnabledRound(
    allRounds,
    tabulatedRound.round_type,
    tabulatedRound.judged_role
  );
  if (!next || next.status !== "pending") return;

  // JnJ finals seed on Begin check-in when both lead/follow sources are ready.
  if (compType === "jack_and_jill" && next.round_type === "final") {
    return;
  }

  const { entryIds, sourceRoundId } = await resolveEntryIdsForRound(
    competitionId,
    compType,
    next.round_type,
    next.judged_role,
    allRounds,
    tabulatedRound.id
  );

  if (entryIds.length === 0) return;

  await seedRoundEntries(next.id, entryIds);
  await supabaseServer
    .from("comp_rounds")
    .update({
      source_round_id: sourceRoundId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);
}
