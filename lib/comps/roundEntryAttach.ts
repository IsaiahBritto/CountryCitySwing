import { supabaseServer } from "@/lib/supabaseServer";
import type { RoundSlotRef } from "@/lib/comps/roundChain";
import type { CompType } from "@/lib/comps/types";
import {
  compEntryMatchesRoundSeed,
  roundAcceptsLateEntries,
  type AttachableCompEntry,
  type LateAttachRoundRef,
} from "@/lib/comps/roundEntryAttachEligibility";

export type {
  AttachableCompEntry,
  LateAttachRoundRef,
} from "@/lib/comps/roundEntryAttachEligibility";
export {
  compEntryMatchesRoundSeed,
  roundAcceptsLateEntries,
} from "@/lib/comps/roundEntryAttachEligibility";

async function loadCompetition(competitionId: string) {
  const { data } = await supabaseServer
    .from("competitions")
    .select("id, comp_type")
    .eq("id", competitionId)
    .maybeSingle();
  return data as { id: string; comp_type: CompType } | null;
}

async function loadRounds(competitionId: string): Promise<LateAttachRoundRef[]> {
  const { data } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role, status, round_order")
    .eq("competition_id", competitionId);
  return (data ?? []) as LateAttachRoundRef[];
}

async function existingRoundEntryIds(
  roundId: string,
  entryIds: string[]
): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set();
  const { data } = await supabaseServer
    .from("comp_round_entries")
    .select("entry_id")
    .eq("round_id", roundId)
    .in("entry_id", entryIds);
  return new Set((data ?? []).map((r) => r.entry_id as string));
}

async function nextDanceOrder(roundId: string): Promise<number> {
  const { data } = await supabaseServer
    .from("comp_round_entries")
    .select("dance_order")
    .eq("round_id", roundId)
    .order("dance_order", { ascending: false })
    .limit(1);
  const max = (data ?? [])[0]?.dance_order;
  return typeof max === "number" ? max + 1 : 1;
}

export interface AttachEntryResult {
  attachedRoundIds: string[];
  skippedRoundIds: string[];
}

export interface SyncOpenRoundsResult {
  attachedCount: number;
  byRound: Record<string, number>;
  dryRun: boolean;
}

async function attachOneEntryToRounds(
  entry: AttachableCompEntry,
  compType: CompType,
  rounds: LateAttachRoundRef[],
  allRounds: RoundSlotRef[],
  dryRun: boolean
): Promise<AttachEntryResult> {
  const attachedRoundIds: string[] = [];
  const skippedRoundIds: string[] = [];

  const eligibleRounds = rounds.filter((r) =>
    roundAcceptsLateEntries(r, compType, allRounds)
  );

  for (const round of eligibleRounds) {
    if (!compEntryMatchesRoundSeed(entry, compType, round)) {
      continue;
    }
    const existing = await existingRoundEntryIds(round.id, [entry.id]);
    if (existing.has(entry.id)) {
      skippedRoundIds.push(round.id);
      continue;
    }
    if (dryRun) {
      attachedRoundIds.push(round.id);
      continue;
    }
    const danceOrder = await nextDanceOrder(round.id);
    const { error } = await supabaseServer.from("comp_round_entries").insert([
      {
        round_id: round.id,
        entry_id: entry.id,
        dance_order: danceOrder,
        checkin_status: "pending",
        scratched: false,
        promoted_alternate: false,
        checkin_role: null,
      },
    ]);
    if (error) {
      if (error.code === "23505") {
        skippedRoundIds.push(round.id);
        continue;
      }
      throw new Error(`Failed to attach entry to round ${round.id}`);
    }
    attachedRoundIds.push(round.id);
  }

  return { attachedRoundIds, skippedRoundIds };
}

export async function attachCompEntryToOpenRounds(
  competitionId: string,
  entryId: string,
  options?: { dryRun?: boolean }
): Promise<AttachEntryResult> {
  const dryRun = options?.dryRun === true;
  const competition = await loadCompetition(competitionId);
  if (!competition) {
    throw new Error("Competition not found");
  }

  const { data: entry } = await supabaseServer
    .from("comp_entries")
    .select("id, entry_kind, role, source_lead_entry_id, competition_id")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry || entry.competition_id !== competitionId) {
    throw new Error("Entry not found");
  }

  const rounds = await loadRounds(competitionId);
  const allRounds: RoundSlotRef[] = rounds.map((r) => ({
    id: r.id,
    round_type: r.round_type,
    judged_role: r.judged_role,
    status: r.status,
    round_order: r.round_order,
  }));

  return attachOneEntryToRounds(
    entry as AttachableCompEntry,
    competition.comp_type,
    rounds,
    allRounds,
    dryRun
  );
}

export async function attachCompEntriesToOpenRounds(
  competitionId: string,
  entryIds: string[],
  options?: { dryRun?: boolean }
): Promise<{ results: AttachEntryResult[]; attachedCount: number }> {
  const results: AttachEntryResult[] = [];
  let attachedCount = 0;
  for (const entryId of entryIds) {
    const result = await attachCompEntryToOpenRounds(competitionId, entryId, options);
    results.push(result);
    attachedCount += result.attachedRoundIds.length;
  }
  return { results, attachedCount };
}

/** Idempotent backfill: every comp_entry → eligible open first-slot rounds. */
export async function syncAllCompEntriesToOpenRounds(
  competitionId: string,
  options?: { dryRun?: boolean }
): Promise<SyncOpenRoundsResult> {
  const dryRun = options?.dryRun === true;
  const competition = await loadCompetition(competitionId);
  if (!competition) {
    throw new Error("Competition not found");
  }

  const { data: entries } = await supabaseServer
    .from("comp_entries")
    .select("id, entry_kind, role, source_lead_entry_id")
    .eq("competition_id", competitionId);

  const byRound: Record<string, number> = {};
  let attachedCount = 0;

  const rounds = await loadRounds(competitionId);
  const allRounds: RoundSlotRef[] = rounds.map((r) => ({
    id: r.id,
    round_type: r.round_type,
    judged_role: r.judged_role,
    status: r.status,
    round_order: r.round_order,
  }));

  for (const entry of entries ?? []) {
    const { attachedRoundIds } = await attachOneEntryToRounds(
      entry as AttachableCompEntry,
      competition.comp_type,
      rounds,
      allRounds,
      dryRun
    );
    for (const roundId of attachedRoundIds) {
      byRound[roundId] = (byRound[roundId] ?? 0) + 1;
      attachedCount += 1;
    }
  }

  return { attachedCount, byRound, dryRun };
}