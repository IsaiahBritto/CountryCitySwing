import { isFirstEnabledSlot, type RoundSlotRef } from "@/lib/comps/roundChain";
import { isJnJFinalsRound } from "@/lib/comps/jnjFinalsSeedHelpers";
import type {
  CompType,
  DanceRole,
  EntryKind,
  RoundStatus,
  RoundType,
} from "@/lib/comps/types";

export interface AttachableCompEntry {
  id: string;
  entry_kind: EntryKind | string;
  role: DanceRole | null;
  source_lead_entry_id?: string | null;
}

export interface LateAttachRoundRef extends RoundSlotRef {
  id: string;
  round_type: RoundType;
  judged_role: DanceRole | null;
  status: RoundStatus;
}

function wantCouplesForFirstSlotSeed(
  compType: CompType,
  roundType: RoundType,
  judgedRole: DanceRole | null
): boolean {
  return (
    compType === "strictly" ||
    (compType === "jack_and_jill" && roundType === "final" && !judgedRole) ||
    (compType === "all_american" && roundType !== "prelims")
  );
}

/** Mirrors resolveEntryIdsForRound first-slot filter for a single entry. */
export function compEntryMatchesRoundSeed(
  entry: AttachableCompEntry,
  compType: CompType,
  round: Pick<LateAttachRoundRef, "round_type" | "judged_role">
): boolean {
  const judgedRole = round.judged_role;
  const wantCouples = wantCouplesForFirstSlotSeed(
    compType,
    round.round_type,
    judgedRole
  );
  if (wantCouples) {
    return entry.entry_kind === "couple";
  }
  if (entry.entry_kind !== "individual") return false;
  if (entry.source_lead_entry_id) return false;
  if (!judgedRole) return true;
  return entry.role === judgedRole;
}

/** Only first-slot rounds before scoring may receive late comp_entries. */
export function roundAcceptsLateEntries(
  round: LateAttachRoundRef,
  compType: CompType,
  allRounds: RoundSlotRef[]
): boolean {
  if (round.status !== "pending" && round.status !== "checkin") {
    return false;
  }
  if (
    isJnJFinalsRound(compType, round.round_type, round.judged_role ?? null)
  ) {
    return false;
  }
  return isFirstEnabledSlot(allRounds, round.round_type);
}