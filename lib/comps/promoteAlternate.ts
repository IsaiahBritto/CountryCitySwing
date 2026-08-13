import { supabaseServer } from "@/lib/supabaseServer";
import { resolveJnJFinalsSourceRounds } from "@/lib/comps/roundChain";
import { canEditCheckin } from "@/lib/comps/roundState";
import type { CompType, DanceRole, RoundStatus } from "@/lib/comps/types";
import {
  PromoteAlternateError,
  requireFinalsPromoteRole,
  resolveCallbackAlternateSource,
  type PromoteAlternateRound,
} from "@/lib/comps/promoteAlternateResolve";
import { isJnJFinalsRound } from "@/lib/comps/jnjFinalsSeedHelpers";

export {
  PromoteAlternateError,
  resolveCallbackAlternateSource,
  type PromoteAlternateRound,
} from "@/lib/comps/promoteAlternateResolve";

/** Backfill checkin_role on promoted alternates created before role was set. */
export async function repairPromotedAlternateRoles(
  roundId: string
): Promise<number> {
  const { data: rows, error } = await supabaseServer
    .from("comp_round_entries")
    .select(
      "id, entry:comp_entries(role)"
    )
    .eq("round_id", roundId)
    .eq("promoted_alternate", true)
    .is("checkin_role", null);
  if (error || !rows?.length) return 0;

  let repaired = 0;
  for (const row of rows) {
    const role = (row.entry as { role?: DanceRole | null } | null)?.role;
    if (role !== "lead" && role !== "follow") continue;
    const { error: updateError } = await supabaseServer
      .from("comp_round_entries")
      .update({ checkin_role: role })
      .eq("id", row.id);
    if (!updateError) repaired++;
  }
  return repaired;
}

/** Resolve which source round supplies alternates for the requested role. */
export async function resolveAlternateSourceRoundId(
  round: PromoteAlternateRound,
  compType: CompType,
  role: DanceRole | undefined
): Promise<{ sourceRoundId: string; checkinRole: DanceRole | null }> {
  if (isJnJFinalsRound(compType, round.round_type, round.judged_role)) {
    const finalsRole = requireFinalsPromoteRole(compType, round, role);
    const { data: allRounds } = await supabaseServer
      .from("comp_rounds")
      .select("id, round_type, judged_role, status, round_order")
      .eq("competition_id", round.competition_id);
    const sources = resolveJnJFinalsSourceRounds(allRounds ?? []);
    if (!sources) {
      throw new PromoteAlternateError(
        "No previous callback slot found to promote alternates from"
      );
    }
    const sourceRoundId =
      finalsRole === "lead" ? sources.leadRound.id : sources.followRound.id;
    return { sourceRoundId, checkinRole: finalsRole };
  }

  return resolveCallbackAlternateSource(round, role);
}

export async function promoteNextAlternate(
  roundId: string,
  role?: DanceRole
): Promise<{ entry_id: string; checkin_role: DanceRole | null }> {
  const { data: round, error: roundError } = await supabaseServer
    .from("comp_rounds")
    .select(
      "id, competition_id, round_type, judged_role, source_round_id, status, competition:competitions(comp_type)"
    )
    .eq("id", roundId)
    .maybeSingle();
  if (roundError || !round) {
    throw new PromoteAlternateError("Round not found", 404);
  }
  if (!canEditCheckin(round.status as RoundStatus)) {
    throw new PromoteAlternateError(
      `Check-in is not active for this round (status ${round.status})`
    );
  }

  const competitionRel = round.competition as
    | { comp_type: CompType }
    | { comp_type: CompType }[]
    | null;
  const compType = Array.isArray(competitionRel)
    ? competitionRel[0]?.comp_type
    : competitionRel?.comp_type;
  if (!compType) {
    throw new PromoteAlternateError("Competition not found", 404);
  }

  await repairPromotedAlternateRoles(roundId);

  const { sourceRoundId, checkinRole } = await resolveAlternateSourceRoundId(
    round as PromoteAlternateRound,
    compType,
    role
  );

  const [{ data: alternates }, { data: existing }] = await Promise.all([
    supabaseServer
      .from("comp_round_results")
      .select("alternate_rank, round_entry:comp_round_entries(entry_id)")
      .eq("round_id", sourceRoundId)
      .not("alternate_rank", "is", null)
      .order("alternate_rank", { ascending: true }),
    supabaseServer
      .from("comp_round_entries")
      .select("entry_id")
      .eq("round_id", roundId),
  ]);

  const inRound = new Set((existing ?? []).map((e) => e.entry_id));
  const next = ((alternates ?? []) as { round_entry?: { entry_id?: string } }[]).find(
    (a) => a.round_entry?.entry_id && !inRound.has(a.round_entry.entry_id)
  );
  if (!next?.round_entry?.entry_id) {
    throw new PromoteAlternateError("No remaining alternates to promote");
  }

  const insertRow: Record<string, unknown> = {
    round_id: roundId,
    entry_id: next.round_entry.entry_id,
    promoted_alternate: true,
  };
  if (checkinRole) {
    insertRow.checkin_role = checkinRole;
  }

  const { data: promoted, error } = await supabaseServer
    .from("comp_round_entries")
    .insert([insertRow])
    .select("id, entry_id, checkin_role, promoted_alternate")
    .single();
  if (error || !promoted) {
    throw new PromoteAlternateError("Failed to promote alternate", 500);
  }

  return {
    entry_id: promoted.entry_id,
    checkin_role: promoted.checkin_role as DanceRole | null,
  };
}
