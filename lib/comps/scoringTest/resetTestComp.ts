import { supabaseServer } from "@/lib/supabaseServer";
import { removeTabulation } from "@/lib/comps/roundData";
import { clearPrizeAwardsForCompetition } from "@/lib/comps/prizeAwards";

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

  if (roundIds.length > 0) {
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
