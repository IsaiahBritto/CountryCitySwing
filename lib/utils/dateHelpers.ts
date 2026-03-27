// lib/utils/dateHelpers.ts

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_TIME_ZONE = "America/Chicago";

/**
 * Ensure an ISO string is parsed as UTC (Supabase/Postgres may return without "Z").
 * dayjs.utc(str) parses strings without "Z" as local time, so we normalize first.
 */
function normalizeToUtcString(isoString: string): string {
  if (!isoString || typeof isoString !== "string") return "";
  const s = isoString.trim();
  // Already has timezone: Z or +00:00 or -05:00 etc.
  if (/[Z+-]\d{2}:?\d{2}$/.test(s) || s.endsWith("Z")) return s;
  // Looks like "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DDTHH:mm" — treat as UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.replace(/T(\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?)/, "T$1Z");
  return s;
}

/**
 * Format an ISO timestamp (UTC) as "YYYY-MM-DDTHH:mm" in America/Chicago
 * for use in datetime-local inputs. Prevents time shifting when editing events.
 */
export function toDateTimeLocalInTimeZone(isoString: string, timeZone: string): string {
  if (!isoString) return "";
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const utcStr = normalizeToUtcString(isoString);
  if (!utcStr) return "";
  const d = dayjs.utc(utcStr).tz(tz);
  return d.isValid() ? d.format("YYYY-MM-DDTHH:mm") : "";
}

export function toDateTimeLocalChicago(isoString: string): string {
  return toDateTimeLocalInTimeZone(isoString, DEFAULT_TIME_ZONE);
}

/**
 * Parse "YYYY-MM-DDTHH:mm" as America/Chicago and return ISO string (UTC)
 * for saving to the API. Ensures the form time is stored correctly regardless of admin timezone.
 */
export function fromDateTimeLocalInTimeZone(dateTimeLocal: string, timeZone: string): string {
  if (!dateTimeLocal || !dateTimeLocal.includes("T")) return "";
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const d = dayjs.tz(dateTimeLocal.replace("T", " "), tz);
  return d.isValid() ? d.toISOString() : "";
}

export function fromDateTimeLocalChicago(dateTimeLocal: string): string {
  return fromDateTimeLocalInTimeZone(dateTimeLocal, DEFAULT_TIME_ZONE);
}

export function parseLocalDate(dateStr: string) {
  if (!dateStr) return new Date(NaN);
  // Accept ISO datetime (e.g. "2026-02-15T19:00:00.000Z") or date-only "YYYY-MM-DD"
  const dateOnly = dateStr.includes("T") ? dateStr.slice(0, 10) : dateStr;
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date(NaN);
  // Local date at midnight
  return new Date(year, month - 1, day);
}

/** Event date as YYYY-MM-DD in America/Chicago so calendar day matches list/carousel/spotlight. */
export function getDateStringInTimeZone(isoDateTime: string, timeZone: string): string {
  if (!isoDateTime) return "";
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/** Event date as YYYY-MM-DD in America/Chicago so calendar day matches list/carousel/spotlight. */
export function getEventDateStringInChicago(startsAt: string): string {
  return getDateStringInTimeZone(startsAt, DEFAULT_TIME_ZONE);
}

/** Formatted event date in America/Chicago (e.g. "Saturday, February 15, 2026"). */
export function formatDateInTimeZone(
  isoDateTime: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }
): string {
  if (!isoDateTime) return "";
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: tz,
  }).format(d);
}

/** Formatted event date in America/Chicago (e.g. "Saturday, February 15, 2026"). */
export function formatEventDateInChicago(
  startsAt: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }
): string {
  return formatDateInTimeZone(startsAt, DEFAULT_TIME_ZONE, options);
}

/** Formatted event time in America/Chicago (e.g. "7:00 PM"). */
export function formatTimeInTimeZone(isoDateTime: string, timeZone: string): string {
  if (!isoDateTime) return "";
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
}

/** Formatted event time in America/Chicago (e.g. "7:00 PM"). */
export function formatEventTimeInChicago(startsAt: string): string {
  return formatTimeInTimeZone(startsAt, DEFAULT_TIME_ZONE);
}

export function getTimeZoneAbbreviation(isoDateTime: string, timeZone: string): string {
  if (!isoDateTime) return "";
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    timeZoneName: "short",
    hour: "numeric",
  }).formatToParts(d);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
  return tzPart;
}

export function formatTimeRangeWithTimeZone(
  startIso: string,
  endIso: string,
  timeZone: string
): { startTime: string; endTime: string; tzAbbrev: string } {
  const tzAbbrev = getTimeZoneAbbreviation(startIso, timeZone);
  return {
    startTime: formatTimeInTimeZone(startIso, timeZone),
    endTime: formatTimeInTimeZone(endIso, timeZone),
    tzAbbrev,
  };
}

export function formatEventDate(
  startsAt: string,
  timeZone: string = DEFAULT_TIME_ZONE,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateInTimeZone(startsAt, timeZone, options);
}

export function formatEventTime(startsAt: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return formatTimeInTimeZone(startsAt, timeZone);
}

export function getEventDateString(startsAt: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return getDateStringInTimeZone(startsAt, timeZone);
}

export function isEventPast(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
): boolean {
  const today = getDateStringInTimeZone(new Date().toISOString(), timeZone);
  const endOrStart = endsAt || startsAt;
  const eventEndDate = getDateStringInTimeZone(endOrStart, timeZone);
  if (!today || !eventEndDate) return false;
  return eventEndDate < today;
}

export function formatEventDateRange(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
): string {
  if (!startsAt) return "";
  if (!endsAt) return formatEventDate(startsAt, timeZone);
  const startDateStr = getEventDateString(startsAt, timeZone);
  const endDateStr = getEventDateString(endsAt, timeZone);
  if (!startDateStr || !endDateStr || startDateStr === endDateStr) {
    return formatEventDate(startsAt, timeZone);
  }
  const startMonth = formatEventDate(startsAt, timeZone, { month: "long" });
  const endMonth = formatEventDate(endsAt, timeZone, { month: "long" });
  const year = formatEventDate(endsAt, timeZone, { year: "numeric" });
  const sameMonth = startMonth === endMonth;
  if (sameMonth) {
    const startDay = formatEventDate(startsAt, timeZone, { day: "numeric" });
    const endDay = formatEventDate(endsAt, timeZone, { day: "numeric" });
    return `${startMonth} ${startDay} – ${endDay}, ${year}`;
  }
  const startFormatted = formatEventDate(startsAt, timeZone, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const endFormatted = formatEventDate(endsAt, timeZone, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${startFormatted} – ${endFormatted}`;
}

/** Today's date as YYYY-MM-DD in America/Chicago. */
export function getTodayStringInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Start and end of today in America/Chicago as UTC ISO strings (for DB queries). */
export function getTodayChicagoUtcRange(): { start: string; end: string } {
  const today = getTodayStringInChicago();
  const start = dayjs.tz(`${today} 00:00:00`, DEFAULT_TIME_ZONE).utc().toISOString();
  const end = dayjs.tz(`${today} 23:59:59.999`, DEFAULT_TIME_ZONE).utc().toISOString();
  return { start, end };
}

/** Next 7 days from now as UTC ISO range (for newsletter "this week" events). */
export function getNextSevenDaysUtcRange(): { start: string; end: string } {
  const start = dayjs().utc().toISOString();
  const end = dayjs().utc().add(7, "day").toISOString();
  return { start, end };
}

/** True if the given Chicago date (YYYY-MM-DD) falls within the event range. */
export function eventSpansDateInChicago(
  startsAt: string,
  endsAt: string | null | undefined,
  dateStr: string
): boolean {
  const startDate = getEventDateStringInChicago(startsAt);
  if (!startDate) return false;
  if (!endsAt) return startDate === dateStr;
  const endDate = getEventDateStringInChicago(endsAt);
  if (!endDate) return startDate === dateStr;
  return dateStr >= startDate && dateStr <= endDate;
}

/** True if the event is past: for multi-day, use ends_at when present. */
export function isEventPastInChicago(
  startsAt: string,
  endsAt?: string | null
): boolean {
  const today = getTodayStringInChicago();
  if (endsAt) {
    const eventEndDate = getEventDateStringInChicago(endsAt);
    if (!eventEndDate) return false;
    return today > eventEndDate;
  }
  const eventDate = getEventDateStringInChicago(startsAt);
  if (!eventDate) return false;
  return eventDate < today;
}

/** Formatted date range in Chicago (e.g. "May 8 – 10, 2026") or single date if no endsAt or same day. */
export function formatEventDateRangeInChicago(
  startsAt: string,
  endsAt?: string | null
): string {
  if (!startsAt) return "";
  if (!endsAt) return formatEventDateInChicago(startsAt);
  const startDateStr = getEventDateStringInChicago(startsAt);
  const endDateStr = getEventDateStringInChicago(endsAt);
  if (!startDateStr || !endDateStr || startDateStr === endDateStr) {
    return formatEventDateInChicago(startsAt);
  }
  const startMonth = formatEventDateInChicago(startsAt, { month: "long" });
  const endMonth = formatEventDateInChicago(endsAt, { month: "long" });
  const year = formatEventDateInChicago(endsAt, { year: "numeric" });
  const sameMonth = startMonth === endMonth;
  if (sameMonth) {
    const startDay = formatEventDateInChicago(startsAt, { day: "numeric" });
    const endDay = formatEventDateInChicago(endsAt, { day: "numeric" });
    return `${startMonth} ${startDay} – ${endDay}, ${year}`;
  }
  const startFormatted = formatEventDateInChicago(startsAt, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const endFormatted = formatEventDateInChicago(endsAt, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${startFormatted} – ${endFormatted}`;
}
