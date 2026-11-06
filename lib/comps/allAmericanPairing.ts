import type { FinalsPairEntry, FinalsPair } from "@/lib/comps/finalsPairing";

export function sortAllAmericanPairsForDanceOrder(pairs: FinalsPair[]): FinalsPair[] {
  return [...pairs].sort((a, b) => {
    const ab = a.lead.bibNumber ?? Number.MAX_SAFE_INTEGER;
    const bb = b.lead.bibNumber ?? Number.MAX_SAFE_INTEGER;
    if (ab !== bb) return ab - bb;
    const af = a.follow.bibNumber ?? Number.MAX_SAFE_INTEGER;
    const bf = b.follow.bibNumber ?? Number.MAX_SAFE_INTEGER;
    if (af !== bf) return af - bf;
    return a.lead.id.localeCompare(b.lead.id);
  });
}

function applyJudgePrimaryBib(pairs: FinalsPair[]): FinalsPair[] {
  const leadOccurrence = new Map<string, number>();
  return pairs.map((p) => {
    const occ = (leadOccurrence.get(p.lead.id) ?? 0) + 1;
    leadOccurrence.set(p.lead.id, occ);
    return {
      ...p,
      judgePrimaryBib: occ >= 2 ? "follow" : "lead",
    };
  });
}

function sortByBib(entries: FinalsPairEntry[]): FinalsPairEntry[] {
  return [...entries].sort((a, b) => {
    const aBib = a.bibNumber ?? Number.MAX_SAFE_INTEGER;
    const bBib = b.bibNumber ?? Number.MAX_SAFE_INTEGER;
    if (aBib !== bBib) return aBib - bBib;
    return a.id.localeCompare(b.id);
  });
}

/**
 * All American: pair leads with follows using rotation on the follow list.
 * Slots = max(L,F); shorter role cycles. Same fixed pairs for all later rounds.
 */
export function computeAllAmericanRotatedPairs(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  rotationOffset: number
): FinalsPair[] {
  const sortedLeads = sortByBib(leads);
  const sortedFollows = sortByBib(follows);
  const L = sortedLeads.length;
  const F = sortedFollows.length;
  if (L === 0 || F === 0) {
    throw new Error("Need at least one lead and one follow to pair");
  }
  const nSlots = Math.max(L, F);
  if (F === 1 && rotationOffset !== 0) {
    throw new Error("Rotation must be 0 with only one follow");
  }
  if (F > 1 && (rotationOffset < 0 || rotationOffset >= F)) {
    throw new Error(`Rotation must be between 0 and ${F - 1}`);
  }
  const raw: FinalsPair[] = [];
  for (let i = 0; i < nSlots; i++) {
    raw.push({
      lead: sortedLeads[i % L],
      follow: sortedFollows[(i + rotationOffset) % F],
    });
  }
  const ordered = sortAllAmericanPairsForDanceOrder(raw);
  return applyJudgePrimaryBib(ordered);
}

/** Uniform random offset in [0, F-1]; F==1 → 0. */
export function randomAllAmericanRotationOffset(
  leadCount: number,
  followCount: number
): number {
  if (leadCount < 1 || followCount < 1) {
    throw new Error("Need at least one lead and one follow");
  }
  if (followCount === 1) return 0;
  return Math.floor(Math.random() * followCount);
}

/**
 * For imbalanced manual pairings: N rows, each lead_re and follow_re valid;
 * each round_entry used at least once; duplicates allowed on scarce side.
 */
export function validateAllAmericanManualPairings(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  pairs: { lead_round_entry_id: string; follow_round_entry_id: string }[]
): { ok: true } | { ok: false; error: string } {
  const L = leads.length;
  const F = follows.length;
  if (L === 0 || F === 0) {
    return { ok: false, error: "No checked-in competitors to pair" };
  }
  const nSlots = Math.max(L, F);
  if (pairs.length !== nSlots) {
    return {
      ok: false,
      error: `Expected ${nSlots} pairings (max of lead/follow counts), got ${pairs.length}`,
    };
  }
  const leadIds = new Set(leads.map((l) => l.id));
  const followIds = new Set(follows.map((f) => f.id));
  const leadUses = new Map<string, number>();
  const followUses = new Map<string, number>();
  for (const pair of pairs) {
    if (!leadIds.has(pair.lead_round_entry_id)) {
      return { ok: false, error: "Invalid lead in manual pairing" };
    }
    if (!followIds.has(pair.follow_round_entry_id)) {
      return { ok: false, error: "Invalid follow in manual pairing" };
    }
    leadUses.set(
      pair.lead_round_entry_id,
      (leadUses.get(pair.lead_round_entry_id) ?? 0) + 1
    );
    followUses.set(
      pair.follow_round_entry_id,
      (followUses.get(pair.follow_round_entry_id) ?? 0) + 1
    );
  }
  const maxLeadRepeat = Math.ceil(nSlots / L);
  const maxFollowRepeat = Math.ceil(nSlots / F);
  for (const [id, c] of leadUses) {
    if (c > maxLeadRepeat) {
      return { ok: false, error: "Too many assignments for one lead" };
    }
  }
  for (const [id, c] of followUses) {
    if (c > maxFollowRepeat) {
      return { ok: false, error: "Too many assignments for one follow" };
    }
  }
  return { ok: true };
}

export function buildAllAmericanManualPairs(
  leads: FinalsPairEntry[],
  follows: FinalsPairEntry[],
  pairs: { lead_round_entry_id: string; follow_round_entry_id: string }[]
): FinalsPair[] {
  const v = validateAllAmericanManualPairings(leads, follows, pairs);
  if (!v.ok) throw new Error(v.error);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const followById = new Map(follows.map((f) => [f.id, f]));
  const sortedFollows = sortByBib(follows);
  const followRank = new Map(sortedFollows.map((f, idx) => [f.id, idx]));
  const built = [...pairs].map((p) => ({
    lead: leadById.get(p.lead_round_entry_id)!,
    follow: followById.get(p.follow_round_entry_id)!,
  }));
  const ordered = sortAllAmericanPairsForDanceOrder(built);
  return applyJudgePrimaryBib(ordered);
}
