import type { DanceRole, ManualPairingRow, PairingMode } from "@/lib/comps/types";

export interface FinalsPairEntry {
  id: string;
  bibNumber: number | null;
  role: DanceRole;
}

export interface FinalsPair {
  lead: FinalsPairEntry;
  follow: FinalsPairEntry;
}

/** followIndex = (leadIndex + rotationOffset) % N */
export function computeRotatedPairs(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  rotationOffset: number
): FinalsPair[] {
  const sortedLeads = sortByBib(leads);
  const sortedFollows = sortByBib(follows);
  if (sortedLeads.length !== sortedFollows.length) {
    throw new Error("Lead and follow counts must match");
  }
  const n = sortedLeads.length;
  if (n === 0) return [];
  if (rotationOffset < 1 || rotationOffset > n - 1) {
    throw new Error(`Rotation must be between 1 and ${n - 1}`);
  }
  return sortedLeads.map((lead, leadIndex) => ({
    lead,
    follow: sortedFollows[(leadIndex + rotationOffset) % n],
  }));
}

export function randomRotationOffset(competitorCount: number): number {
  if (competitorCount < 2) {
    throw new Error("Need at least 2 competitors for rotation");
  }
  return Math.floor(Math.random() * (competitorCount - 1)) + 1;
}

function sortByBib(entries: FinalsPairEntry[]): FinalsPairEntry[] {
  return [...entries].sort((a, b) => {
    const aBib = a.bibNumber ?? Number.MAX_SAFE_INTEGER;
    const bBib = b.bibNumber ?? Number.MAX_SAFE_INTEGER;
    if (aBib !== bBib) return aBib - bBib;
    return a.id.localeCompare(b.id);
  });
}

export function isJnJFinalsPrePairing(round: {
  round_type: string;
  judged_role: string | null;
  pairings_confirmed_at: string | null;
}): boolean {
  return (
    round.round_type === "final" &&
    round.judged_role == null &&
    round.pairings_confirmed_at == null
  );
}

export function validateManualPairings(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  pairs: ManualPairingRow[]
): { ok: true } | { ok: false; error: string } {
  const n = leads.length;
  if (n !== follows.length) {
    return { ok: false, error: "Lead and follow counts must match" };
  }
  if (n === 0) {
    return { ok: false, error: "No checked-in competitors to pair" };
  }
  if (pairs.length !== n) {
    return {
      ok: false,
      error: `Expected ${n} pairings, got ${pairs.length}`,
    };
  }

  const leadIds = new Set(leads.map((l) => l.id));
  const followIds = new Set(follows.map((f) => f.id));
  const usedLeads = new Set<string>();
  const usedFollows = new Set<string>();

  for (const pair of pairs) {
    if (!leadIds.has(pair.lead_round_entry_id)) {
      return { ok: false, error: "Invalid lead in manual pairing" };
    }
    if (!followIds.has(pair.follow_round_entry_id)) {
      return { ok: false, error: "Invalid follow in manual pairing" };
    }
    if (usedLeads.has(pair.lead_round_entry_id)) {
      return { ok: false, error: "Each lead may only be paired once" };
    }
    if (usedFollows.has(pair.follow_round_entry_id)) {
      return { ok: false, error: "Each follow may only be paired once" };
    }
    usedLeads.add(pair.lead_round_entry_id);
    usedFollows.add(pair.follow_round_entry_id);
  }

  return { ok: true };
}

export function buildManualPairs(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  pairs: ManualPairingRow[]
): FinalsPair[] {
  const validation = validateManualPairings(leads, follows, pairs);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const followById = new Map(follows.map((f) => [f.id, f]));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sortedPairs = [...pairs].sort((a, b) => {
    const leadA = leadById.get(a.lead_round_entry_id)!;
    const leadB = leadById.get(b.lead_round_entry_id)!;
    const aBib = leadA.bibNumber ?? Number.MAX_SAFE_INTEGER;
    const bBib = leadB.bibNumber ?? Number.MAX_SAFE_INTEGER;
    if (aBib !== bBib) return aBib - bBib;
    return leadA.id.localeCompare(leadB.id);
  });
  return sortedPairs.map((pair) => ({
    lead: leadById.get(pair.lead_round_entry_id)!,
    follow: followById.get(pair.follow_round_entry_id)!,
  }));
}

export function resolveFinalsPairs(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  round: {
    pairing_mode?: PairingMode | null;
    rotation_offset: number | null;
    manual_pairings: ManualPairingRow[] | null;
  }
): FinalsPair[] {
  const mode = round.pairing_mode ?? "rotation";
  if (mode === "manual") {
    if (!round.manual_pairings?.length) {
      throw new Error("Manual pairings not saved");
    }
    return buildManualPairs(leads, follows, round.manual_pairings);
  }
  if (round.rotation_offset == null) {
    throw new Error("Rotation offset not set");
  }
  return computeRotatedPairs(leads, follows, round.rotation_offset);
}

export function pairingsReady(round: {
  pairing_mode?: PairingMode | null;
  rotation_offset: number | null;
  manual_pairings: ManualPairingRow[] | null;
}): boolean {
  const mode = round.pairing_mode ?? "rotation";
  if (mode === "manual") {
    return (round.manual_pairings?.length ?? 0) > 0;
  }
  return round.rotation_offset != null;
}
