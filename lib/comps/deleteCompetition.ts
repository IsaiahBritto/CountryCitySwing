import { supabaseServer } from "@/lib/supabaseServer";
import { clearPrizeAwardsForCompetition } from "@/lib/comps/prizeAwards";
import { deleteCompetitionRounds } from "@/lib/comps/deleteCompetitionRounds";

/** Permanently remove a competition and all related scoring data. */
export async function deleteCompetitionFully(
  competitionId: string
): Promise<void> {
  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id")
    .eq("id", competitionId)
    .maybeSingle();

  if (!competition) {
    throw new Error("Competition not found");
  }

  await clearPrizeAwardsForCompetition(competitionId);
  await deleteCompetitionRounds(competitionId);

  const { error: judgesError } = await supabaseServer
    .from("comp_judge_assignments")
    .delete()
    .eq("competition_id", competitionId);
  if (judgesError) {
    throw new Error(`Failed to delete judge assignments: ${judgesError.message}`);
  }

  const { error: entriesError } = await supabaseServer
    .from("comp_entries")
    .delete()
    .eq("competition_id", competitionId);
  if (entriesError) {
    throw new Error(`Failed to delete entries: ${entriesError.message}`);
  }

  const { error } = await supabaseServer
    .from("competitions")
    .delete()
    .eq("id", competitionId);
  if (error) {
    throw new Error(`Failed to delete competition: ${error.message}`);
  }
}
