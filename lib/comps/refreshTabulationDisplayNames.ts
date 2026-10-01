import { supabaseServer } from "@/lib/supabaseServer";
import { entryDisplay, loadRoundContext } from "@/lib/comps/roundData";
import { patchTabulationEntries } from "@/lib/comps/tabulationDisplayPatch";

/** Update display names in stored tabulation JSON without recomputing scores. */
export async function refreshTabulationDisplayNamesForRound(
  roundId: string
): Promise<boolean> {
  const ctx = await loadRoundContext(roundId);
  if (!ctx.round.tabulation) return false;

  const displays = new Map(
    ctx.roundEntries.map((re) => [re.id, entryDisplay(re)])
  );

  const patched = patchTabulationEntries(
    ctx.round.tabulation,
    displays
  );

  const { error } = await supabaseServer
    .from("comp_rounds")
    .update({
      tabulation: patched,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);
  if (error) throw new Error("Failed to update tabulation display names");
  return true;
}

/** Refresh all tabulated/published rounds for competitions (or subset). */
export async function refreshTabulationDisplayNamesForCompetitions(
  competitionIds: string[]
): Promise<{ roundIds: string[] }> {
  if (competitionIds.length === 0) return { roundIds: [] };

  const { data: rounds, error } = await supabaseServer
    .from("comp_rounds")
    .select("id, status, tabulation")
    .in("competition_id", competitionIds)
    .in("status", ["tabulated", "published"]);
  if (error) throw new Error("Failed to load rounds");

  const updated: string[] = [];
  for (const r of rounds ?? []) {
    if (!r.tabulation) continue;
    await refreshTabulationDisplayNamesForRound(r.id);
    updated.push(r.id);
  }
  return { roundIds: updated };
}

export { patchTabulationEntries } from "@/lib/comps/tabulationDisplayPatch";
