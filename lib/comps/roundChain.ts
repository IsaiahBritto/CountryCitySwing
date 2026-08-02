import type { DanceRole, RoundStatus, RoundType } from "@/lib/comps/types";

/** Fixed competition round slots in progression order. */
export const ROUND_SLOT_ORDER: RoundType[] = [
  "prelims",
  "quarterfinal",
  "semifinal",
  "final",
];

const SLOT_LABEL: Record<RoundType, string> = {
  prelims: "Prelims",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

export interface RoundSlotRef {
  id: string;
  round_type: RoundType;
  judged_role: DanceRole | null;
  status: RoundStatus;
  round_order?: number;
}

export function getSlotLabel(roundType: RoundType): string {
  return SLOT_LABEL[roundType] ?? roundType;
}

export function roundOrderForType(roundType: RoundType): number {
  const idx = ROUND_SLOT_ORDER.indexOf(roundType);
  return idx >= 0 ? idx + 1 : 99;
}

export function isRoundFinalized(status: RoundStatus): boolean {
  return status === "tabulated" || status === "published";
}

/** Rounds matching a slot type (Strictly: one; JnJ callback: lead + follow). */
export function roundsForSlot(
  rounds: RoundSlotRef[],
  roundType: RoundType
): RoundSlotRef[] {
  return rounds.filter((r) => r.round_type === roundType);
}

export function isSlotSkipped(
  rounds: RoundSlotRef[],
  roundType: RoundType,
  judgedRole?: DanceRole | null
): boolean {
  if (judgedRole) {
    return !rounds.some(
      (r) => r.round_type === roundType && r.judged_role === judgedRole
    );
  }
  return roundsForSlot(rounds, roundType).length === 0;
}

/**
 * Walk backward from targetType to find the nearest enabled round row.
 * For JnJ callback rounds, matches judged_role on the same slot stage when
 * possible; finals couple rounds use judged_role null.
 */
export function findPreviousEnabledRound(
  rounds: RoundSlotRef[],
  targetType: RoundType,
  judgedRole: DanceRole | null = null
): RoundSlotRef | null {
  const targetIdx = ROUND_SLOT_ORDER.indexOf(targetType);
  if (targetIdx <= 0) return null;

  for (let i = targetIdx - 1; i >= 0; i--) {
    const slotType = ROUND_SLOT_ORDER[i];
    const inSlot = roundsForSlot(rounds, slotType);
    if (inSlot.length === 0) continue;

    if (slotType === "final" || judgedRole == null) {
      return inSlot[0] ?? null;
    }
    const sameRole = inSlot.find((r) => r.judged_role === judgedRole);
    if (sameRole) return sameRole;
    return inSlot[0] ?? null;
  }
  return null;
}

/** Next enabled round after sourceType (same role preference for JnJ). */
export function findNextEnabledRound(
  rounds: RoundSlotRef[],
  sourceType: RoundType,
  judgedRole: DanceRole | null = null
): RoundSlotRef | null {
  const sourceIdx = ROUND_SLOT_ORDER.indexOf(sourceType);
  if (sourceIdx < 0) return null;

  for (let i = sourceIdx + 1; i < ROUND_SLOT_ORDER.length; i++) {
    const slotType = ROUND_SLOT_ORDER[i];
    const inSlot = roundsForSlot(rounds, slotType);
    if (inSlot.length === 0) continue;

    if (slotType === "final" || judgedRole == null) {
      return inSlot[0] ?? null;
    }
    const sameRole = inSlot.find((r) => r.judged_role === judgedRole);
    if (sameRole) return sameRole;
    return inSlot[0] ?? null;
  }
  return null;
}

/** Whether this is the first enabled slot in the chain for this round. */
export function isFirstEnabledSlot(
  rounds: RoundSlotRef[],
  targetType: RoundType
): boolean {
  const targetIdx = ROUND_SLOT_ORDER.indexOf(targetType);
  for (let i = 0; i < targetIdx; i++) {
    if (roundsForSlot(rounds, ROUND_SLOT_ORDER[i]).length > 0) return false;
  }
  return true;
}

export function canOpenRound(
  rounds: RoundSlotRef[],
  target: RoundSlotRef
): { ok: true } | { ok: false; reason: string } {
  if (isFirstEnabledSlot(rounds, target.round_type)) {
    return { ok: true };
  }
  const prev = findPreviousEnabledRound(
    rounds,
    target.round_type,
    target.judged_role
  );
  if (!prev) {
    return { ok: true };
  }
  if (!isRoundFinalized(prev.status)) {
    return {
      ok: false,
      reason: `Finalize ${getSlotLabel(prev.round_type)} before starting ${getSlotLabel(target.round_type)}`,
    };
  }
  return { ok: true };
}

export function roundTitle(r: {
  round_type: RoundType | string;
  judged_role?: DanceRole | string | null;
}): string {
  const base = getSlotLabel(r.round_type as RoundType);
  return r.judged_role
    ? `${base} — ${r.judged_role === "lead" ? "Leads" : "Follows"}`
    : base;
}
