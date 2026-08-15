import { isSocialFinanceViewer } from "@/lib/socialFinanceAccess";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import {
  DEFAULT_TIME_ZONE,
  isEventActiveOnCalendarDay,
  isRegistrationWindowOpen,
} from "@/lib/utils/dateHelpers";

export type RegistrationAccessLevel = "admin" | "instructor" | "social_viewer";

export type RegistrationAccess = {
  userId: string;
  level: RegistrationAccessLevel;
};

export type RegistrationEventRow = {
  type?: string | null;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
};

export function resolveRegistrationAccess(
  userId: string,
  role: string | null | undefined
): RegistrationAccessLevel | null {
  const roleLower = (role || "").toLowerCase();
  if (roleLower === "admin") return "admin";
  if (roleLower === "instructor") return "instructor";
  if (isSocialFinanceViewer(userId)) return "social_viewer";
  return null;
}

export function canViewRegistrationEvent(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): boolean {
  if (access === "admin") return true;
  if (access === "social_viewer") {
    return isSocialEventType(event.type);
  }
  if (access === "instructor") {
    const tz = event.time_zone || DEFAULT_TIME_ZONE;
    return isEventActiveOnCalendarDay(event.starts_at, event.ends_at, tz, now);
  }
  return false;
}

export function canMutateRegistrationEvent(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): boolean {
  if (access === "admin") return true;
  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  if (access === "instructor") {
    const tz = event.time_zone || DEFAULT_TIME_ZONE;
    return isEventActiveOnCalendarDay(event.starts_at, event.ends_at, tz, now);
  }
  if (access === "social_viewer") {
    if (!isRegistrationWindowOpen(event.starts_at, event.ends_at, tz, now)) {
      return false;
    }
    return isSocialEventType(event.type);
  }
  return false;
}

/** @deprecated Use canViewRegistrationEvent */
export function isRegistrationOpenForEvent(
  access: RegistrationAccessLevel,
  event: RegistrationEventRow,
  now: Date = new Date()
): boolean {
  if (access === "social_viewer") {
    return canViewRegistrationEvent(access, event, now);
  }
  return canMutateRegistrationEvent(access, event, now);
}

export function showRegistrationForEvents(
  access: RegistrationAccessLevel | null,
  events: RegistrationEventRow[],
  now: Date = new Date()
): boolean {
  if (!access) return false;
  if (access === "admin" || access === "social_viewer") return true;
  return events.some((event) => canMutateRegistrationEvent(access, event, now));
}
