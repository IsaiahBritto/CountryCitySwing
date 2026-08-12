import type { CheckinRole, DanceRole } from "@/lib/comps/types";

/** Resolve check-in list role when legacy promoted rows lack checkin_role. */
export function effectiveCheckinRole(row: {
  checkin_role: CheckinRole | null;
  entry?: { role?: DanceRole | null } | null;
}): DanceRole | null {
  return row.checkin_role ?? row.entry?.role ?? null;
}

export function isLeadCheckinEntry(row: {
  checkin_role: CheckinRole | null;
  entry?: { role?: DanceRole | null } | null;
}): boolean {
  return effectiveCheckinRole(row) === "lead";
}

export function isFollowCheckinEntry(row: {
  checkin_role: CheckinRole | null;
  entry?: { role?: DanceRole | null } | null;
}): boolean {
  return effectiveCheckinRole(row) === "follow";
}
