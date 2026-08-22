import {
  type SocialDoorPayoutRow,
} from "@/lib/socialFinancesConstants";
import { isDoormanPosition } from "@/lib/socialScheduleSlots";

export type DoorPayoutMergeSlot = {
  id: string;
  position: string | null;
  assignee_id: string | null;
  slot_starts_at?: string | null;
  assignee?: { first_name?: string | null; last_name?: string | null } | null;
};

function toDisplayName(profile?: {
  first_name?: string | null;
  last_name?: string | null;
} | null): string {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Merge filled Doorman schedule slots into door_payouts.
 * Preserves amount_override, paid_at, and amount for matching slot_id.
 * Keeps existing rows for cleared slots and manual rows without slot_id.
 */
export function mergeDoorPayoutsFromSlots({
  existingRows,
  slots,
  defaultAmount,
}: {
  existingRows: SocialDoorPayoutRow[];
  slots: DoorPayoutMergeSlot[];
  defaultAmount: number;
}): SocialDoorPayoutRow[] {
  const filledSlots = slots
    .filter((s) => isDoormanPosition(s.position) && s.assignee_id)
    .sort((a, b) => (a.slot_starts_at || "").localeCompare(b.slot_starts_at || ""));

  const existingBySlot = new Map<string, SocialDoorPayoutRow>();
  const manualRows: SocialDoorPayoutRow[] = [];
  for (const row of existingRows) {
    if (row.slot_id) {
      existingBySlot.set(row.slot_id, row);
    } else {
      manualRows.push(row);
    }
  }

  const filledSlotIds = new Set(filledSlots.map((s) => String(s.id)));

  const fromSlots: SocialDoorPayoutRow[] = filledSlots.map((slot, index) => {
    const slotId = String(slot.id);
    const prev = existingBySlot.get(slotId);
    const name =
      toDisplayName(slot.assignee) ||
      prev?.name ||
      `Doorman ${index + 1}`;
    return {
      slot_id: slotId,
      name,
      amount: prev?.amount ?? defaultAmount,
      amount_override: prev?.amount_override ?? null,
      paid_at: prev?.paid_at ?? null,
    };
  });

  const clearedSlotRows = existingRows.filter(
    (r) => r.slot_id && !filledSlotIds.has(r.slot_id)
  );

  return [...fromSlots, ...clearedSlotRows, ...manualRows];
}

/** Mark a door payout row paid by slot_id (preferred) or array index. */
export function applyDoorPayoutMarkPaid(
  doors: SocialDoorPayoutRow[],
  {
    slotId,
    index,
    paidAt,
  }: {
    slotId?: string | null;
    index?: number;
    paidAt: string;
  }
): { doors: SocialDoorPayoutRow[]; marked: boolean } {
  const next = doors.map((d) => ({ ...d }));
  let idx = -1;
  const trimmedSlotId = slotId?.trim();
  if (trimmedSlotId) {
    idx = next.findIndex((d) => d.slot_id === trimmedSlotId);
  }
  if (
    idx < 0 &&
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < next.length
  ) {
    idx = index;
  }
  if (idx < 0) {
    return { doors: next, marked: false };
  }
  next[idx] = { ...next[idx], paid_at: paidAt };
  return { doors: next, marked: true };
}

export function doorPayoutRowsEqual(
  a: SocialDoorPayoutRow[],
  b: SocialDoorPayoutRow[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.slot_id !== right.slot_id) return false;
    if (left.name !== right.name) return false;
    if (left.amount !== right.amount) return false;
    if ((left.amount_override ?? null) !== (right.amount_override ?? null)) return false;
    if ((left.paid_at ?? null) !== (right.paid_at ?? null)) return false;
  }
  return true;
}
