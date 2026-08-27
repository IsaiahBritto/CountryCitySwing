import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  DEFAULT_TIME_ZONE,
  getDateStringInTimeZone,
} from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_CLASS_LOCATION = "630 Rundle Ave";

export const DEFAULT_CLASS_PRICE = 10;

export const DEFAULT_CLASS_CCS_TEAM_PRICE = 0;

export const DEFAULT_CLASS_START_HOUR = 18;
export const DEFAULT_CLASS_START_MINUTE = 45;

/** Tuesday in dayjs (.day(): 0 = Sunday). */
const TUESDAY = 2;

export type ClassEventScheduleInput = {
  id?: number | string;
  type?: string | null;
  starts_at?: string | null;
  time_zone?: string | null;
};

export function buildOccupiedClassEventDates(
  events: ClassEventScheduleInput[],
  options?: {
    excludeEventId?: number | string | null;
    defaultTimeZone?: string;
  }
): Set<string> {
  const exclude = options?.excludeEventId;
  const fallbackTz = options?.defaultTimeZone || DEFAULT_TIME_ZONE;
  const dates = new Set<string>();

  for (const ev of events) {
    if ((ev.type || "").trim().toLowerCase() !== "class") continue;
    if (!ev.starts_at) continue;
    if (exclude != null && ev.id != null && String(ev.id) === String(exclude)) {
      continue;
    }
    const tz = ev.time_zone || fallbackTz;
    const ymd = getDateStringInTimeZone(ev.starts_at, tz);
    if (ymd) dates.add(ymd);
  }

  return dates;
}

function nextTuesdayAt645(current: dayjs.Dayjs): dayjs.Dayjs {
  let dayStart = current.startOf("day");
  const daysUntilTuesday = (TUESDAY - dayStart.day() + 7) % 7;
  let candidate = dayStart
    .add(daysUntilTuesday, "day")
    .hour(DEFAULT_CLASS_START_HOUR)
    .minute(DEFAULT_CLASS_START_MINUTE)
    .second(0)
    .millisecond(0);

  if (!candidate.isAfter(current)) {
    candidate = candidate.add(7, "day");
  }

  return candidate;
}

/**
 * Next Tuesday at 6:45 PM in the event time zone that does not already have a Class event.
 */
export function nextAvailableClassTuesdayDateTimeLocal(
  timeZone: string = DEFAULT_TIME_ZONE,
  occupiedDates: ReadonlySet<string> = new Set(),
  now: Date = new Date()
): string {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const current = dayjs(now).tz(tz);
  let candidate = nextTuesdayAt645(current);

  for (let i = 0; i < 104; i++) {
    const ymd = candidate.format("YYYY-MM-DD");
    if (!occupiedDates.has(ymd)) {
      return candidate.format("YYYY-MM-DDTHH:mm");
    }
    candidate = candidate.add(7, "day");
  }

  return candidate.format("YYYY-MM-DDTHH:mm");
}

/** @deprecated Prefer nextAvailableClassTuesdayDateTimeLocal with occupied dates. */
export function defaultClassStartsAtDateTimeLocal(
  timeZone: string = DEFAULT_TIME_ZONE,
  now: Date = new Date(),
  occupiedDates?: ReadonlySet<string>
): string {
  return nextAvailableClassTuesdayDateTimeLocal(
    timeZone,
    occupiedDates ?? new Set(),
    now
  );
}
