// lib/utils/dateHelpers.ts

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Events are in America/Chicago (Nashville). Use this for consistent date display. */
const EVENT_TIMEZONE = "America/Chicago";

/**
 * Format an ISO timestamp (UTC) as "YYYY-MM-DDTHH:mm" in America/Chicago
 * for use in datetime-local inputs. Prevents time shifting when editing events.
 */
export function toDateTimeLocalChicago(isoString: string): string {
  if (!isoString) return "";
  const d = dayjs.utc(isoString).tz(EVENT_TIMEZONE);
  return d.isValid() ? d.format("YYYY-MM-DDTHH:mm") : "";
}

/**
 * Parse "YYYY-MM-DDTHH:mm" as America/Chicago and return ISO string (UTC)
 * for saving to the API. Ensures the form time is stored correctly regardless of admin timezone.
 */
export function fromDateTimeLocalChicago(dateTimeLocal: string): string {
  if (!dateTimeLocal || !dateTimeLocal.includes("T")) return "";
  const d = dayjs.tz(dateTimeLocal.replace("T", " "), EVENT_TIMEZONE);
  return d.isValid() ? d.toISOString() : "";
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
export function getEventDateStringInChicago(startsAt: string): string {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  if (isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d); // "YYYY-MM-DD" with en-CA
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
  if (!startsAt) return "";
  const d = new Date(startsAt);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: EVENT_TIMEZONE,
  }).format(d);
}

/** Formatted event time in America/Chicago (e.g. "7:00 PM"). */
export function formatEventTimeInChicago(startsAt: string): string {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIMEZONE,
  }).format(d);
}

/** Today's date as YYYY-MM-DD in America/Chicago. */
export function getTodayStringInChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
