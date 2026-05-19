import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { DEFAULT_TIME_ZONE, formatEventTime } from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

export const SOCIAL_DOORMAN_POSITION = "Doorman";

export type SocialDoormanWindow = {
  slot_starts_at: string;
  slot_ends_at: string;
  timeRange: string;
};

export function isSocialEventType(type: string | null | undefined): boolean {
  return (type || "").trim().toLowerCase() === "social";
}

/** Plain "Doorman" (enum value). Legacy labeled strings still parse for display. */
export function isDoormanPosition(position: string | null | undefined): boolean {
  const p = (position || "").trim();
  if (!p) return false;
  if (p === SOCIAL_DOORMAN_POSITION) return true;
  return /^Doorman\s*\(/i.test(p);
}

export function formatDoormanTimeRange(
  slotStartsAt: string,
  slotEndsAt: string,
  timeZone: string = DEFAULT_TIME_ZONE
): string {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  return `${formatEventTime(slotStartsAt, tz)} – ${formatEventTime(slotEndsAt, tz)}`;
}

/** Split legacy "Doorman (6:00 PM – 7:00 PM)" into role + time range. */
export function parseDoormanSlotDisplay(position: string | null | undefined): {
  role: string;
  timeRange: string | null;
} {
  const trimmed = (position || "").trim();
  const match = trimmed.match(/^Doorman\s*\((.+)\)\s*$/i);
  if (match) {
    return { role: SOCIAL_DOORMAN_POSITION, timeRange: match[1].trim() };
  }
  return { role: trimmed || "Slot", timeRange: null };
}

type SocialEventTimes = {
  type?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  time_zone?: string | null;
};

type SlotTimes = {
  slot_starts_at?: string | null;
  slot_ends_at?: string | null;
};

function effectiveEndsAtForSocialSlots(
  endsAt: string | null | undefined
): string | null {
  return endsAt ?? null;
}

/**
 * Display label for a Doorman slot (DB times, legacy position text, or derived from event).
 */
export function getDoormanSlotDisplay(
  position: string,
  doormanIndex: number,
  event?: SocialEventTimes | null,
  _doormanSlotCount = 0,
  slotTimes?: SlotTimes | null
): { role: string; timeRange: string | null } {
  const tz = event?.time_zone || DEFAULT_TIME_ZONE;

  if (slotTimes?.slot_starts_at && slotTimes?.slot_ends_at) {
    return {
      role: SOCIAL_DOORMAN_POSITION,
      timeRange: formatDoormanTimeRange(slotTimes.slot_starts_at, slotTimes.slot_ends_at, tz),
    };
  }

  const parsed = parseDoormanSlotDisplay(position);
  if (parsed.timeRange) return parsed;

  if (
    !isDoormanPosition(position) ||
    !event ||
    !isSocialEventType(event.type) ||
    !event.starts_at
  ) {
    return parsed;
  }

  const effectiveEnd = effectiveEndsAtForSocialSlots(event.ends_at ?? null);
  const windows = buildSocialDoormanSlotWindows(event.starts_at, effectiveEnd, tz);
  const window = windows[doormanIndex];
  if (window) {
    return { role: SOCIAL_DOORMAN_POSITION, timeRange: window.timeRange };
  }
  return parsed;
}

export function isValidSchedulePosition(position: string): boolean {
  const p = position.trim();
  const BASE_POSITIONS = [
    "Beginner Lead Teacher Week A",
    "Beginner Follow Teacher Week A",
    "Beginner Lead Teacher Week B",
    "Beginner Follow Teacher Week B",
    "Beginner Lead Teacher Week C",
    "Beginner Follow Teacher Week C",
    "Doorman",
    "Other Help",
  ];
  return BASE_POSITIONS.includes(p);
}

/**
 * Number of Doorman slots to open: one per hour of the event (partial hours round up), minimum 1.
 */
export function countSocialDoormanSlots(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
): number {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const start = dayjs(startsAt).tz(tz);
  if (!start.isValid()) return 1;

  const end = endsAt ? dayjs(endsAt).tz(tz) : start.add(1, "hour");
  if (!end.isValid() || !end.isAfter(start)) return 1;

  const diffHours = end.diff(start, "minute") / 60;
  return Math.max(1, Math.ceil(diffHours));
}

/** One Doorman hour window per event hour (stored in slot_starts_at / slot_ends_at). */
export function buildSocialDoormanSlotWindows(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
): SocialDoormanWindow[] {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const count = countSocialDoormanSlots(startsAt, endsAt, tz);
  const start = dayjs(startsAt).tz(tz);
  const end = endsAt ? dayjs(endsAt).tz(tz) : start.add(1, "hour");

  const windows: SocialDoormanWindow[] = [];
  for (let i = 0; i < count; i++) {
    const slotStart = start.add(i, "hour");
    let slotEnd = start.add(i + 1, "hour");
    if (slotEnd.isAfter(end)) slotEnd = end;
    const slotStartsAt = slotStart.toISOString();
    const slotEndsAt = slotEnd.toISOString();
    windows.push({
      slot_starts_at: slotStartsAt,
      slot_ends_at: slotEndsAt,
      timeRange: formatDoormanTimeRange(slotStartsAt, slotEndsAt, tz),
    });
  }
  return windows;
}

/** Sort schedule slots chronologically (Doorman hours use slot_starts_at). */
export function compareScheduleSlotsByTime<
  T extends {
    position?: string;
    slot_starts_at?: string | null;
    created_at?: string | null;
  },
>(a: T, b: T): number {
  const aStart = a.slot_starts_at ? new Date(a.slot_starts_at).getTime() : NaN;
  const bStart = b.slot_starts_at ? new Date(b.slot_starts_at).getTime() : NaN;
  if (!Number.isNaN(aStart) && !Number.isNaN(bStart)) return aStart - bStart;
  if (!Number.isNaN(aStart)) return -1;
  if (!Number.isNaN(bStart)) return 1;
  return (a.created_at || "").localeCompare(b.created_at || "");
}
