import {
  canMutateRegistrationEvent,
  type RegistrationAccessLevel,
  type RegistrationEventRow,
} from "@/lib/registrationAuthPolicy";

/** Instructors granted class level breakdown on registration during the event window. */
export const CLASS_LEVEL_BREAKDOWN_VIEWER_IDS = new Set<string>([
  "4b2e7196-75b3-4c28-b4bd-099f19d22781", // Hannah Bonaguide
]);

export function isClassLevelBreakdownViewer(userId: string): boolean {
  return CLASS_LEVEL_BREAKDOWN_VIEWER_IDS.has(userId);
}

/** Admins always; allowlisted staff only during the registration window for the event. */
export function canViewClassLevelBreakdown(
  userId: string,
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): boolean {
  if (access === "admin") return true;
  if (!isClassLevelBreakdownViewer(userId)) return false;
  return canMutateRegistrationEvent(access, event, now);
}
