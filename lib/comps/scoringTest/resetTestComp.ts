import { supabaseServer } from "@/lib/supabaseServer";
import { clearPrizeAwardsForCompetition } from "@/lib/comps/prizeAwards";
import { deleteCompetitionRounds } from "@/lib/comps/deleteCompetitionRounds";

/**
 * Full test-comp reset: preserves entries, bibs, signups, and judge assignments;
 * deletes all rounds so admin must re-enable with fresh callback/alt config.
 */
export async function resetTestComp(competitionId: string): Promise<void> {
  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, test_comp")
    .eq("id", competitionId)
    .maybeSingle();

  if (!competition) {
    throw new Error("Competition not found");
  }
  if (!competition.test_comp) {
    throw new Error("Reset is only available for test competitions");
  }

  await deleteCompetitionRounds(competitionId);
  await clearPrizeAwardsForCompetition(competitionId);

  await supabaseServer
    .from("competitions")
    .update({ status: "setup", updated_at: new Date().toISOString() })
    .eq("id", competitionId);

  // Remove J&J finals couple entries created by pairing confirm (preserve individuals).
  await supabaseServer
    .from("comp_entries")
    .delete()
    .eq("competition_id", competitionId)
    .eq("entry_kind", "couple")
    .not("source_lead_entry_id", "is", null);
}
