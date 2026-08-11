import { supabaseServer } from "@/lib/supabaseServer";
import { entryDisplay } from "@/lib/comps/roundData";
import { siblingRoundFor } from "@/lib/comps/judgeScope";
import {
  computeHeatPlan,
  type HeatPlanEntry,
  type HeatPlanResult,
} from "@/lib/comps/heatPlan";
import type { CompType, DanceRole } from "@/lib/comps/types";

interface RoundEntryRow {
  id: string;
  checkin_status: string;
  scratched: boolean;
  checkin_role: DanceRole | null;
  entry: {
    entry_kind: string;
    role: DanceRole | null;
    lead_bib: { bib_number: number | null } | null;
    follow_bib: { bib_number: number | null } | null;
  };
}

function activeForHeatPlan(row: RoundEntryRow): boolean {
  return !row.scratched;
}

function checkedInCount(rows: RoundEntryRow[]): number {
  return rows.filter(
    (r) => activeForHeatPlan(r) && r.checkin_status === "checked_in"
  ).length;
}

function registeredCount(rows: RoundEntryRow[]): number {
  return rows.filter(activeForHeatPlan).length;
}

function sizingCount(rows: RoundEntryRow[], roundStatus: string): number {
  const checked = checkedInCount(rows);
  if (
    (roundStatus === "checkin" || roundStatus === "open") &&
    checked > 0
  ) {
    return checked;
  }
  return registeredCount(rows);
}

function shouldUseCheckedInAssignment(
  rows: RoundEntryRow[],
  roundStatus: string
): boolean {
  if (roundStatus === "checkin" || roundStatus === "open") {
    return rows.some(
      (r) =>
        activeForHeatPlan(r) &&
        (r.checkin_status === "checked_in" || r.checkin_status === "absent")
    );
  }
  return checkedInCount(rows) > 0;
}

function checkedInRows(rows: RoundEntryRow[]): RoundEntryRow[] {
  return rows.filter(
    (r) => activeForHeatPlan(r) && r.checkin_status === "checked_in"
  );
}

function toHeatPlanEntry(row: RoundEntryRow): HeatPlanEntry {
  const display = entryDisplay(row as Parameters<typeof entryDisplay>[0]);
  const entry = row.entry;
  let poolRole: HeatPlanEntry["poolRole"] = "couple";
  if (entry.entry_kind === "individual") {
    poolRole = row.checkin_role ?? entry.role ?? "lead";
  }
  return {
    id: row.id,
    bibNumber: display.bibNumber,
    poolRole,
  };
}

async function countRegisteredRole(
  competitionId: string,
  role: DanceRole
): Promise<number> {
  const { data } = await supabaseServer
    .from("comp_entries")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("entry_kind", "individual")
    .eq("role", role);
  return (data ?? []).length;
}

async function loadOppositeRoleRows(
  competitionId: string,
  siblingRoundId: string | null
): Promise<RoundEntryRow[]> {
  if (siblingRoundId) {
    const { data } = await supabaseServer
      .from("comp_round_entries")
      .select("id, checkin_status, scratched")
      .eq("round_id", siblingRoundId);
    return (data ?? []) as unknown as RoundEntryRow[];
  }
  return [];
}

async function countOppositeRoleSizing(
  competitionId: string,
  judgedRole: DanceRole,
  siblingRoundId: string | null,
  roundStatus: string
): Promise<number> {
  const opposite: DanceRole = judgedRole === "lead" ? "follow" : "lead";
  const siblingRows = await loadOppositeRoleRows(competitionId, siblingRoundId);
  if (siblingRows.length > 0) {
    return sizingCount(siblingRows, roundStatus);
  }
  return countRegisteredRole(competitionId, opposite);
}

export const MAX_FLOOR_COUPLES_REQUIRED =
  "Set max couples on floor in competition settings before setting up heats";

export interface HeatSetupContext {
  maxFloorCouples: number | null;
  compType: CompType;
  roundJudgedRole: DanceRole | null;
  /** Sizing pool: registered pre-check-in, checked-in during check-in. */
  leadCount: number;
  followCount: number;
  entries: HeatPlanEntry[];
  heatCountOverride: number | null;
}

export async function loadHeatSetupContext(
  roundId: string,
  heatCountOverride: number | null | undefined
): Promise<HeatSetupContext> {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("*, competition:competitions(*)")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) throw new Error("Round not found");

  const competition = (
    round as { competition: { id: string; comp_type: CompType; max_floor_couples?: number } }
  ).competition;
  const maxFloorCouples = competition.max_floor_couples ?? null;

  const { data: allRounds } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role")
    .eq("competition_id", round.competition_id);

  const sibling = siblingRoundFor(allRounds ?? [], round);

  const { data: entryRows } = await supabaseServer
    .from("comp_round_entries")
    .select(
      "id, checkin_status, scratched, checkin_role, entry:comp_entries(entry_kind, role, lead_bib:comp_bibs!comp_entries_lead_bib_id_fkey(bib_number), follow_bib:comp_bibs!comp_entries_follow_bib_id_fkey(bib_number))"
    )
    .eq("round_id", roundId);

  const rows = (entryRows ?? []) as unknown as RoundEntryRow[];
  const activeRows = rows.filter(activeForHeatPlan);
  const usingCheckedIn = shouldUseCheckedInAssignment(activeRows, round.status);
  const assignmentRows = usingCheckedIn ? checkedInRows(activeRows) : activeRows;
  const planEntries = assignmentRows.map(toHeatPlanEntry);

  let leadCount = 0;
  let followCount = 0;

  if (competition.comp_type === "strictly") {
    leadCount = sizingCount(activeRows, round.status);
    followCount = leadCount;
  } else if (round.judged_role == null) {
    const leadRows = activeRows.filter(
      (r) => (r.checkin_role ?? r.entry.role) === "lead"
    );
    const followRows = activeRows.filter(
      (r) => (r.checkin_role ?? r.entry.role) === "follow"
    );
    leadCount = sizingCount(leadRows, round.status);
    followCount = sizingCount(followRows, round.status);
  } else if (round.judged_role === "lead") {
    leadCount = sizingCount(activeRows, round.status);
    followCount = await countOppositeRoleSizing(
      round.competition_id,
      round.judged_role,
      sibling?.id ?? null,
      round.status
    );
  } else {
    followCount = sizingCount(activeRows, round.status);
    leadCount = await countOppositeRoleSizing(
      round.competition_id,
      round.judged_role,
      sibling?.id ?? null,
      round.status
    );
  }

  const override =
    heatCountOverride === undefined
      ? ((round as { heat_count?: number | null }).heat_count ?? null)
      : heatCountOverride;

  return {
    maxFloorCouples,
    compType: competition.comp_type,
    roundJudgedRole: round.judged_role,
    leadCount,
    followCount,
    entries: planEntries,
    heatCountOverride: override,
  };
}

export function buildHeatPlanFromContext(
  ctx: HeatSetupContext
): HeatPlanResult | null {
  if (ctx.entries.length === 0) return null;
  if (ctx.heatCountOverride == null && ctx.maxFloorCouples == null) return null;

  return computeHeatPlan({
    maxFloorCouples: ctx.maxFloorCouples ?? 1,
    heatCountOverride: ctx.heatCountOverride,
    compType: ctx.compType,
    roundJudgedRole: ctx.roundJudgedRole,
    leadCount: ctx.leadCount,
    followCount: ctx.followCount,
    entries: ctx.entries,
  });
}

export async function applyHeatPlan(
  roundId: string,
  plan: HeatPlanResult,
  heatCountStored: number | null
): Promise<{ heats: { id: string; heat_number: number }[]; assigned: number }> {
  await supabaseServer.from("comp_heats").delete().eq("round_id", roundId);

  const { data: heats, error: heatsError } = await supabaseServer
    .from("comp_heats")
    .insert(
      Array.from({ length: plan.heatCount }, (_, i) => ({
        round_id: roundId,
        heat_number: i + 1,
      }))
    )
    .select("id, heat_number");
  if (heatsError || !heats) {
    throw new Error("Failed to create heats");
  }

  const assignedIds = new Set(plan.assignments.map((a) => a.entryId));

  const { data: roundEntries } = await supabaseServer
    .from("comp_round_entries")
    .select("id")
    .eq("round_id", roundId);
  for (const row of roundEntries ?? []) {
    if (assignedIds.has(row.id)) continue;
    await supabaseServer
      .from("comp_round_entries")
      .update({ heat_id: null, dance_order: null })
      .eq("id", row.id);
  }

  for (const assignment of plan.assignments) {
    const heat = heats[assignment.heatIndex];
    if (!heat) continue;
    const { error } = await supabaseServer
      .from("comp_round_entries")
      .update({ heat_id: heat.id, dance_order: assignment.danceOrder })
      .eq("id", assignment.entryId);
    if (error) {
      throw new Error("Failed to assign heats");
    }
  }

  const { error: roundError } = await supabaseServer
    .from("comp_rounds")
    .update({
      heat_count: heatCountStored,
      heat_return_count: plan.heatReturnCount,
      heat_return_role: plan.heatReturnRole,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);
  if (roundError) {
    throw new Error("Failed to save heat metadata");
  }

  return { heats, assigned: plan.assignments.length };
}

export async function setupRoundHeats(
  roundId: string,
  heatCountOverride: number | null | undefined
) {
  const ctx = await loadHeatSetupContext(roundId, heatCountOverride);
  if (ctx.entries.length === 0) {
    throw new Error("No entries to assign");
  }

  const storedOverride =
    heatCountOverride === undefined ? ctx.heatCountOverride : heatCountOverride;

  if (storedOverride == null && ctx.maxFloorCouples == null) {
    throw new Error(MAX_FLOOR_COUPLES_REQUIRED);
  }

  const plan = buildHeatPlanFromContext(ctx);
  if (!plan) {
    throw new Error("No entries to assign");
  }

  const result = await applyHeatPlan(roundId, plan, storedOverride);
  return { ...result, plan };
}

async function refreshSingleRoundHeatsIfConfigured(
  roundId: string
): Promise<Awaited<ReturnType<typeof setupRoundHeats>> | null> {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || !["checkin", "open"].includes(round.status)) return null;

  const { count } = await supabaseServer
    .from("comp_heats")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  if ((count ?? 0) === 0) return null;

  try {
    return await setupRoundHeats(roundId, undefined);
  } catch {
    return null;
  }
}

/** Re-assign heats during check-in when roster check-in counts change. */
export async function refreshRoundHeatsIfConfigured(roundId: string) {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status, competition_id, round_type, judged_role")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || !["checkin", "open"].includes(round.status)) return null;

  const roundIds = [roundId];
  if (round.judged_role != null) {
    const { data: allRounds } = await supabaseServer
      .from("comp_rounds")
      .select("id, round_type, judged_role")
      .eq("competition_id", round.competition_id);
    const sibling = siblingRoundFor(allRounds ?? [], round);
    if (sibling && sibling.id !== roundId) {
      roundIds.push(sibling.id);
    }
  }

  let lastResult: Awaited<ReturnType<typeof setupRoundHeats>> | null = null;
  for (const id of roundIds) {
    const result = await refreshSingleRoundHeatsIfConfigured(id);
    if (result) lastResult = result;
  }
  return lastResult;
}
