import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  DEFAULT_TIME_ZONE,
  eventSpansDateInTimeZone,
  getEventDateStringInChicago,
} from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

export type ScheduleEventDateRangeInput = {
  starts_at: string;
  ends_at?: string | null;
  type?: string | null;
  time_zone?: string | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: string): boolean {
  return DATE_ONLY.test(value.trim());
}

/** First and last calendar day of the month containing `viewDate` (America/Chicago). */
export function monthBoundsInChicago(viewDate: Date | string): {
  from: string;
  to: string;
} {
  const raw =
    typeof viewDate === "string" ? viewDate.trim().slice(0, 10) : undefined;
  const base = raw
    ? dayjs.tz(raw, DEFAULT_TIME_ZONE)
    : dayjs(viewDate).tz(DEFAULT_TIME_ZONE);
  const monthStart = base.startOf("month");
  return {
    from: monthStart.format("YYYY-MM-DD"),
    to: monthStart.endOf("month").format("YYYY-MM-DD"),
  };
}

/** UTC ISO bounds for a broad Supabase pre-filter on event rows. */
export function chicagoDateRangeToUtcBounds(from: string, to: string): {
  rangeStartIso: string;
  rangeEndIso: string;
} {
  return {
    rangeStartIso: dayjs
      .tz(`${from} 00:00:00`, DEFAULT_TIME_ZONE)
      .utc()
      .toISOString(),
    rangeEndIso: dayjs
      .tz(`${to} 23:59:59.999`, DEFAULT_TIME_ZONE)
      .utc()
      .toISOString(),
  };
}

/**
 * Whether an event should appear on the team calendar in [from, to] (inclusive dates).
 * Matches ScheduleCalendar day rules: conventions span days in event TZ; others use Chicago start date.
 */
export function eventOverlapsChicagoDateRange(
  event: ScheduleEventDateRangeInput,
  from: string,
  to: string
): boolean {
  if (!event.starts_at?.trim()) return false;

  const isConvention =
    (event.type || "").trim().toLowerCase() === "convention";
  const tz = event.time_zone || DEFAULT_TIME_ZONE;

  if (isConvention && event.ends_at) {
    let d = from;
    while (d <= to) {
      if (eventSpansDateInTimeZone(event.starts_at, event.ends_at, d, tz)) {
        return true;
      }
      d = dayjs.tz(d, DEFAULT_TIME_ZONE).add(1, "day").format("YYYY-MM-DD");
    }
    return false;
  }

  const startDate = getEventDateStringInChicago(event.starts_at);
  return startDate >= from && startDate <= to;
}

export function filterEventsInChicagoDateRange<T extends ScheduleEventDateRangeInput>(
  events: T[],
  from: string,
  to: string
): T[] {
  return events.filter((e) => eventOverlapsChicagoDateRange(e, from, to));
}
