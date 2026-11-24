import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** PST boundary for public upcoming vs past tabs on non-CCS listings. */
export const NON_CCS_PUBLIC_TAB_TZ = "America/Los_Angeles";

export type CommunityEventScheduleFields = {
  starts_at?: string | null;
  ends_at?: string | null;
  time_zone?: string | null;
};

function normalizeToUtcString(isoString: string): string {
  const s = isoString.trim();
  if (/[Z+-]\d{2}:?\d{2}$/.test(s) || s.endsWith("Z")) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return s.replace(/T(\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?)/, "T$1Z");
  }
  return s;
}

/** Calendar date (YYYY-MM-DD) of the event's last day in the event time zone (or PST). */
export function getCommunityEventLastLocalDate(
  event: CommunityEventScheduleFields
): string | null {
  const ref = event.ends_at ?? event.starts_at;
  if (!ref) return null;
  const eventTz = event.time_zone?.trim() || NON_CCS_PUBLIC_TAB_TZ;
  const utcStr = normalizeToUtcString(ref);
  const d = dayjs.utc(utcStr).tz(eventTz);
  return d.isValid() ? d.format("YYYY-MM-DD") : null;
}

/**
 * Instant when the event moves to the Past tab: 00:00 PST on the day after
 * the event's last calendar day (in event time_zone, else PST).
 */
export function getCommunityPastBoundaryInstant(
  event: CommunityEventScheduleFields
): dayjs.Dayjs | null {
  const lastDate = getCommunityEventLastLocalDate(event);
  if (!lastDate) return null;
  return dayjs.tz(lastDate, NON_CCS_PUBLIC_TAB_TZ).add(1, "day").startOf("day");
}

export function isCommunityEventPublicPast(
  event: CommunityEventScheduleFields,
  now: dayjs.Dayjs = dayjs()
): boolean {
  const boundary = getCommunityPastBoundaryInstant(event);
  if (!boundary) return false;
  return !now.isBefore(boundary);
}

export type PublicCommunityEventTab = "upcoming" | "past";

export type PublicCommunityEventListItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  time_zone?: string | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  strictly_level?: string | null;
  jnj_level?: string | null;
  community_payment_disclaimer?: string | null;
  community_payment_disclaimer_tone?: string | null;
  tab: PublicCommunityEventTab;
  hasPublishedResults: boolean;
  publicSlug: string;
};

export function communityEventPublicTab(
  event: CommunityEventScheduleFields,
  now?: dayjs.Dayjs
): PublicCommunityEventTab {
  return isCommunityEventPublicPast(event, now) ? "past" : "upcoming";
}

/** Sort key for past events: most recent first. */
export function communityEventSortInstant(event: {
  starts_at?: string | null;
  ends_at?: string | null;
}): number {
  const ref = event.ends_at ?? event.starts_at;
  if (!ref) return 0;
  const t = new Date(ref).getTime();
  return Number.isFinite(t) ? t : 0;
}