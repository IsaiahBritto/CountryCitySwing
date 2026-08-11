import type { CheckinStatus } from "@/lib/comps/types";

export interface CheckinOptimisticEntry {
  id: string;
  checkin_status: CheckinStatus;
  checkin_role?: "lead" | "follow" | null;
  scratched?: boolean;
  heat_id?: string | null;
  dance_order?: number | null;
}

export interface CheckinCounts {
  presentCount: number;
  unresolvedCheckin: number;
  leadPresent: number;
  followPresent: number;
  leadUnresolved: number;
  followUnresolved: number;
}

export function patchEntryCheckinStatus<T extends CheckinOptimisticEntry>(
  entries: T[],
  roundEntryId: string,
  checkin_status: CheckinStatus
): T[] {
  return entries.map((e) => {
    if (e.id !== roundEntryId) return e;
    const clearedHeats =
      checkin_status !== "checked_in"
        ? { heat_id: null as string | null, dance_order: null as number | null }
        : {};
    return { ...e, checkin_status, ...clearedHeats };
  });
}

export function recomputeCheckinCounts(
  entries: CheckinOptimisticEntry[],
  prePairing = false
): CheckinCounts {
  const active = entries.filter((e) => !e.scratched);
  const leadEntries = prePairing
    ? active.filter((e) => e.checkin_role === "lead")
    : [];
  const followEntries = prePairing
    ? active.filter((e) => e.checkin_role === "follow")
    : [];

  return {
    leadPresent: leadEntries.filter((e) => e.checkin_status === "checked_in")
      .length,
    followPresent: followEntries.filter((e) => e.checkin_status === "checked_in")
      .length,
    leadUnresolved: leadEntries.filter((e) => e.checkin_status === "pending")
      .length,
    followUnresolved: followEntries.filter((e) => e.checkin_status === "pending")
      .length,
    unresolvedCheckin: active.filter((e) => e.checkin_status === "pending")
      .length,
    presentCount: active.filter((e) => e.checkin_status === "checked_in").length,
  };
}
