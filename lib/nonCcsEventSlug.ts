import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function normalizeToUtcString(isoString: string): string {
  const s = isoString.trim();
  if (/[Z+-]\d{2}:?\d{2}$/.test(s) || s.endsWith("Z")) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return s.replace(/T(\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?)/, "T$1Z");
  }
  return s;
}

/** "GAC Classic" → "GAC-Classic" */
export function slugifyCommunityEventTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "Event";
  const slug = trimmed
    .replace(/['']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "Event";
}

/** Month-day-year in the event time zone, e.g. 11-14-2026 */
export function communityEventSlugDatePart(
  starts_at: string,
  time_zone?: string | null
): string {
  const tz = time_zone?.trim() || DEFAULT_TIME_ZONE;
  const utcStr = normalizeToUtcString(starts_at);
  const d = dayjs.utc(utcStr).tz(tz);
  if (!d.isValid()) return "1-1-1970";
  return `${d.month() + 1}-${d.date()}-${d.year()}`;
}

export type CommunityEventSlugFields = {
  id?: string;
  title: string;
  starts_at: string;
  time_zone?: string | null;
};

/** Public URL slug: Title-With-Dashes-M-D-YYYY */
export function communityEventPublicSlug(
  event: CommunityEventSlugFields,
  uniqueSuffix?: string
): string {
  const titlePart = slugifyCommunityEventTitle(event.title);
  const datePart = communityEventSlugDatePart(event.starts_at, event.time_zone);
  let slug = `${titlePart}-${datePart}`;
  if (uniqueSuffix) {
    slug += `-${uniqueSuffix.replace(/-/g, "").slice(0, 8)}`;
  }
  return slug;
}

export function buildPublicSlugMap(
  events: CommunityEventSlugFields[]
): Map<string, string> {
  const baseSlugs = events.map((e) => ({
    id: e.id ?? "",
    base: communityEventPublicSlug(e),
  }));
  const countByBase = new Map<string, number>();
  for (const { base } of baseSlugs) {
    countByBase.set(base, (countByBase.get(base) ?? 0) + 1);
  }

  const out = new Map<string, string>();
  for (const e of events) {
    const id = e.id ?? "";
    const base = communityEventPublicSlug(e);
    const needsSuffix = (countByBase.get(base) ?? 0) > 1;
    out.set(
      id,
      needsSuffix && e.id
        ? communityEventPublicSlug(e, e.id.slice(0, 8))
        : base
    );
  }
  return out;
}

export function publicSlugPath(slug: string): string {
  return `/non-ccs-events/${encodeURIComponent(slug)}`;
}