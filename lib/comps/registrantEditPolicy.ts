import { supabaseServer } from "@/lib/supabaseServer";
import type { RoundStatus } from "@/lib/comps/types";

export type RegistrantEditTier = "full" | "limited";

const PRE_SCORING: RoundStatus[] = ["pending", "checkin"];
const SCORING_OR_LATER: RoundStatus[] = [
  "open",
  "closed",
  "tabulated",
  "published",
];

/** True when any score row exists for this competition entry. */
export async function entryHasScores(entryId: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("comp_scores")
    .select("id, round_entry:comp_round_entries!inner(entry_id)")
    .eq("round_entry.entry_id", entryId)
    .limit(1);
  if (error) throw new Error("Failed to check entry scores");
  return (data ?? []).length > 0;
}

/** True if any of the entries have scores. */
export async function anyEntryHasScores(entryIds: string[]): Promise<boolean> {
  if (entryIds.length === 0) return false;
  for (const id of entryIds) {
    if (await entryHasScores(id)) return true;
  }
  return false;
}

export async function loadCompetitionRounds(
  competitionId: string
): Promise<{ id: string; status: RoundStatus }[]> {
  const { data, error } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("competition_id", competitionId);
  if (error) throw new Error("Failed to load rounds");
  return (data ?? []) as { id: string; status: RoundStatus }[];
}

/** Full tier only when every round is pending/checkin and no linked entry has scores. */
export async function editTierForCompetition(
  competitionId: string,
  linkedEntryIds: string[]
): Promise<RegistrantEditTier> {
  const rounds = await loadCompetitionRounds(competitionId);
  const entriesForComp = linkedEntryIds.length
    ? linkedEntryIds
    : await entryIdsForCompetition(competitionId);

  if (await anyEntryHasScores(entriesForComp)) return "limited";

  for (const r of rounds) {
    if (SCORING_OR_LATER.includes(r.status)) return "limited";
  }
  return "full";
}

async function entryIdsForCompetition(competitionId: string): Promise<string[]> {
  const { data } = await supabaseServer
    .from("comp_entries")
    .select("id")
    .eq("competition_id", competitionId);
  return (data ?? []).map((e) => e.id);
}

/** Most restrictive tier across competitions that touch these entries. */
export async function editTierForEntries(
  entryIds: string[]
): Promise<RegistrantEditTier> {
  if (entryIds.length === 0) return "full";

  const { data: entries, error } = await supabaseServer
    .from("comp_entries")
    .select("id, competition_id")
    .in("id", entryIds);
  if (error) throw new Error("Failed to load entries");

  const byComp = new Map<string, string[]>();
  for (const e of entries ?? []) {
    const list = byComp.get(e.competition_id) ?? [];
    list.push(e.id);
    byComp.set(e.competition_id, list);
  }

  for (const [compId, ids] of byComp) {
    const tier = await editTierForCompetition(compId, ids);
    if (tier === "limited") return "limited";
  }
  return "full";
}

export function isPreScoringRoundStatus(status: RoundStatus): boolean {
  return PRE_SCORING.includes(status);
}

export const STRUCTURAL_EDIT_BLOCKED_MESSAGE =
  "Division and role changes are not allowed after scoring has started or this entry has scores. You can still update names and emails.";
