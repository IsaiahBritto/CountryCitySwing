import { supabaseServer } from "@/lib/supabaseServer";
import { removeTabulation } from "@/lib/comps/roundData";

/** Remove all rounds and scoring data for a competition (entries/judges preserved). */
export async function deleteCompetitionRounds(
  competitionId: string
): Promise<void> {
  const { data: rounds } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("competition_id", competitionId);

  const roundIds = (rounds ?? []).map((r) => r.id);

  for (const round of rounds ?? []) {
    if (round.status === "published" || round.status === "tabulated") {
      try {
        await removeTabulation(round.id);
      } catch {
        // Round may already be closed.
      }
    }
  }

  if (roundIds.length === 0) return;

  await supabaseServer.from("comp_scores").delete().in("round_id", roundIds);
  await supabaseServer
    .from("comp_judge_sheets")
    .delete()
    .in("round_id", roundIds);
  await supabaseServer
    .from("comp_round_results")
    .delete()
    .in("round_id", roundIds);
  await supabaseServer
    .from("comp_round_entries")
    .delete()
    .in("round_id", roundIds);
  await supabaseServer.from("comp_heats").delete().in("round_id", roundIds);
  await supabaseServer.from("comp_rounds").delete().in("id", roundIds);
}
