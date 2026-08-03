import type { DanceRole } from "@/lib/comps/types";

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
