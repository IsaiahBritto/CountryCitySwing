import type { RoundStatus } from "@/lib/comps/types";

/**
 * Single source of truth for round status transitions:
 *   pending -> checkin -> open -> closed -> tabulated -> published
 * Backward moves are limited and CJ/admin initiated (reopen scoring, remove
 * tabulation, unpublish). Tabulate/publish transitions are only performed by
 * their dedicated endpoints.
 */
const TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  pending: ["checkin"],
  checkin: ["open", "pending"],
  open: ["closed", "checkin"],
  closed: ["tabulated", "open"],
  tabulated: ["published", "closed"],
  published: ["tabulated"],
};

export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Transitions the generic PATCH endpoint may perform directly. */
export function isDirectTransition(from: RoundStatus, to: RoundStatus): boolean {
  if (!canTransition(from, to)) return false;
  // tabulated/published states are managed by the tabulate/publish endpoints.
  if (to === "tabulated" || to === "published") return false;
  if (from === "tabulated" || from === "published") return false;
  return true;
}
