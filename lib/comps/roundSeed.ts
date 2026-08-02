import { supabaseServer } from "@/lib/supabaseServer";
import type { CompType, DanceRole, RoundType } from "@/lib/comps/types";
import {
  findNextEnabledRound,
  findPreviousEnabledRound,
  isFirstEnabledSlot,
  type RoundSlotRef,
} from "@/lib/comps/roundChain";

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
