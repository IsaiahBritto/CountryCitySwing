import type { CompType, DanceRole } from "@/lib/comps/types";
import { sortByBib } from "@/lib/comps/entrySort";

export interface HeatPlanEntry {
  id: string;
  bibNumber: number | null;
  /** lead / follow for JnJ individuals; couple for strictly */
  poolRole: DanceRole | "couple";
}

export interface HeatPlanInput {
  maxFloorCouples: number;
  heatCountOverride: number | null;
  compType: CompType;
  roundJudgedRole: DanceRole | null;
  /** Sizing pool: checked-in during check-in, registered roster before. */
  leadCount: number;
  followCount: number;
  entries: HeatPlanEntry[];
}

export interface HeatPlanAssignment {
  entryId: string;
  heatIndex: number;
  danceOrder: number;
}

export interface HeatPlanResult {
  heatCount: number;
  autoHeatCount: boolean;
  couplesPerHeat: number[];
  heatSizes: number[];
  assignments: HeatPlanAssignment[];
  heatReturnCount: number;
  heatReturnRole: DanceRole | null;
}

/** Split total into H buckets as evenly as possible (extra go to earlier heats). */
export function distributeEvenly(total: number, heatCount: number): number[] {
  if (heatCount < 1) throw new Error("heatCount must be >= 1");
  if (total <= 0) return Array.from({ length: heatCount }, () => 0);
  const base = Math.floor(total / heatCount);
  const remainder = total % heatCount;
  return Array.from({ length: heatCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function autoHeatCountFromFloor(
  leadCount: number,
  followCount: number,
  maxFloorCouples: number
): number {
  const pool = Math.max(leadCount, followCount, 1);
  return Math.max(1, Math.ceil(pool / maxFloorCouples));
}

function sequentialCapFill(caps: number[], total: number): number[] {
  const sizes: number[] = [];
  let remaining = total;
  for (const cap of caps) {
    const take = Math.min(cap, remaining);
    sizes.push(take);
    remaining -= take;
  }
  return sizes;
}

function computeReturnMeta(
  couplesPerHeat: number[],
  leadCount: number,
  followCount: number
): { heatReturnCount: number; heatReturnRole: DanceRole | null } {
  if (leadCount === followCount) {
    return { heatReturnCount: 0, heatReturnRole: null };
  }
  const scarceRole: DanceRole = leadCount < followCount ? "lead" : "follow";
  const scarceCount = Math.min(leadCount, followCount);
  const scarcePerHeat = sequentialCapFill(couplesPerHeat, scarceCount);
  const heatReturnCount = couplesPerHeat.reduce(
    (sum, cap, i) => sum + Math.max(0, cap - scarcePerHeat[i]),
    0
  );
  return { heatReturnCount, heatReturnRole: scarceRole };
}

function sizesForPoolRole(
  poolRole: HeatPlanEntry["poolRole"],
  couplesPerHeat: number[],
  leadCount: number,
  followCount: number
): number[] {
  if (poolRole === "couple") {
    return couplesPerHeat;
  }
  if (leadCount === followCount) {
    return couplesPerHeat;
  }
  const scarceRole: DanceRole = leadCount < followCount ? "lead" : "follow";
  if (poolRole === scarceRole) {
    const scarceCount = Math.min(leadCount, followCount);
    return sequentialCapFill(couplesPerHeat, scarceCount);
  }
  const abundantCount = Math.max(leadCount, followCount);
  return distributeEvenly(abundantCount, couplesPerHeat.length);
}

function assignEntriesToHeats(
  entries: HeatPlanEntry[],
  sizesPerHeat: number[]
): HeatPlanAssignment[] {
  const sorted = sortByBib(
    entries,
    (e) => e.bibNumber,
    () => 0,
    (e) => e.id
  );
  const assignments: HeatPlanAssignment[] = [];
  let idx = 0;
  for (let h = 0; h < sizesPerHeat.length; h++) {
    const size = sizesPerHeat[h];
    for (let slot = 0; slot < size; slot++) {
      if (idx >= sorted.length) break;
      assignments.push({
        entryId: sorted[idx].id,
        heatIndex: h,
        danceOrder: slot + 1,
      });
      idx++;
    }
  }
  return assignments;
}

export function computeHeatPlan(input: HeatPlanInput): HeatPlanResult {
  const {
    maxFloorCouples,
    heatCountOverride,
    compType,
    leadCount,
    followCount,
    entries,
  } = input;

  if (entries.length === 0) {
    throw new Error("No entries to assign");
  }

  const autoHeatCount = autoHeatCountFromFloor(
    leadCount,
    followCount,
    maxFloorCouples
  );
  const heatCount = heatCountOverride ?? autoHeatCount;
  const usingHeatCountOverride = heatCountOverride != null;

  const poolMax =
    compType === "strictly"
      ? leadCount
      : Math.max(leadCount, followCount, 1);
  const couplesPerHeat = distributeEvenly(poolMax, heatCount);
  const { heatReturnCount, heatReturnRole } =
    compType === "strictly"
      ? { heatReturnCount: 0, heatReturnRole: null as DanceRole | null }
      : computeReturnMeta(couplesPerHeat, leadCount, followCount);

  const byRole = new Map<HeatPlanEntry["poolRole"], HeatPlanEntry[]>();
  for (const e of entries) {
    byRole.set(e.poolRole, [...(byRole.get(e.poolRole) ?? []), e]);
  }

  const assignments: HeatPlanAssignment[] = [];
  const heatSizes = Array.from({ length: heatCount }, () => 0);

  for (const [poolRole, roleEntries] of byRole) {
    const sizes = sizesForPoolRole(
      poolRole,
      couplesPerHeat,
      leadCount,
      followCount
    );
    const roleAssignments = assignEntriesToHeats(roleEntries, sizes);
    for (const a of roleAssignments) {
      assignments.push(a);
      heatSizes[a.heatIndex]++;
    }
  }

  return {
    heatCount,
    autoHeatCount: !usingHeatCountOverride,
    couplesPerHeat,
    heatSizes,
    assignments,
    heatReturnCount,
    heatReturnRole,
  };
}

/** Preview auto heat count without full assignment. */
export function previewAutoHeatCount(input: {
  maxFloorCouples: number;
  leadCount: number;
  followCount: number;
  compType: CompType;
  entryCount: number;
}): number {
  if (input.compType === "strictly") {
    return autoHeatCountFromFloor(
      input.entryCount,
      input.entryCount,
      input.maxFloorCouples
    );
  }
  return autoHeatCountFromFloor(
    input.leadCount,
    input.followCount,
    input.maxFloorCouples
  );
}
