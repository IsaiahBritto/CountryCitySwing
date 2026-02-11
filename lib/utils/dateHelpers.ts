// lib/utils/dateHelpers.ts

/** Events are in America/Chicago (Nashville). Use this for consistent date display. */
const EVENT_TIMEZONE = "America/Chicago";

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

/** True if the event's Chicago date is before today (Chicago). */
export function isEventPastInChicago(startsAt: string): boolean {
  const eventDate = getEventDateStringInChicago(startsAt);
  if (!eventDate) return false;
  return eventDate < getTodayStringInChicago();
}
