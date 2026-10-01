import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

export type ClassWeekLetter = "A" | "B" | "C";

const WEEK_LETTERS: ClassWeekLetter[] = ["A", "B", "C"];
const TUESDAY = 2;

export type ClassScheduleEventInput = {
  id: string | number;
  type?: string | null;
  starts_at?: string | null;
  time_zone?: string | null;
  class_week_override?: string | null;
};

export type TeamSlotForRotation = {
  position?: string | null;
};

export type RotationAnchorConfig = {
  anchor_date: string;
  anchor_week: ClassWeekLetter;
};

export function isTuesdayClassEvent(
  event: ClassScheduleEventInput,
  defaultTz = DEFAULT_TIME_ZONE
): boolean {
  if ((event.type || "").trim().toLowerCase() !== "class") return false;
  if (!event.starts_at) return false;
  const tz = event.time_zone || defaultTz;
  const d = dayjs(event.starts_at).tz(tz);
  return d.day() === TUESDAY;
}

export function nextWeekLetter(letter: ClassWeekLetter): ClassWeekLetter {
  const idx = WEEK_LETTERS.indexOf(letter);
  return WEEK_LETTERS[(idx + 1) % WEEK_LETTERS.length];
}

export function weekFromBeginnerPosition(position: string): ClassWeekLetter | null {
  const m = position.match(/Week ([ABC])/i);
  if (!m) return null;
  return m[1].toUpperCase() as ClassWeekLetter;
}

export function normalizeWeekOverride(value: string | null | undefined): ClassWeekLetter | null {
  const v = (value || "").trim().toUpperCase();
  if (v === "A" || v === "B" || v === "C") return v;
  return null;
}

export function inferWeekFromSlots(slots: TeamSlotForRotation[] | undefined): ClassWeekLetter | null {
  if (!slots?.length) return null;
  for (const slot of slots) {
    const pos = slot.position || "";
    if (!pos.toLowerCase().includes("beginner")) continue;
    const week = weekFromBeginnerPosition(pos);
    if (week) return week;
  }
  return null;
}

function eventSortKey(event: ClassScheduleEventInput, defaultTz: string): number {
  return new Date(event.starts_at || 0).getTime();
}

export function filterAndSortTuesdayClassEvents(
  events: ClassScheduleEventInput[],
  defaultTz = DEFAULT_TIME_ZONE
): ClassScheduleEventInput[] {
  return events
    .filter((e) => isTuesdayClassEvent(e, defaultTz))
    .sort((a, b) => eventSortKey(a, defaultTz) - eventSortKey(b, defaultTz));
}

function weekFromAnchorIndex(index: number, anchorWeek: ClassWeekLetter): ClassWeekLetter {
  const anchorIdx = WEEK_LETTERS.indexOf(anchorWeek);
  return WEEK_LETTERS[(anchorIdx + index) % WEEK_LETTERS.length];
}

function resolveEffectiveWeekForEvent(
  event: ClassScheduleEventInput,
  slotsByEventId: Map<string, TeamSlotForRotation[]>
): ClassWeekLetter | null {
  const override = normalizeWeekOverride(event.class_week_override);
  if (override) return override;

  const slots = slotsByEventId.get(String(event.id));
  return inferWeekFromSlots(slots);
}

/**
 * Resolve beginner week letter for a Tuesday Class event.
 */
export function resolveWeekLetterForEvent(
  event: ClassScheduleEventInput,
  allEvents: ClassScheduleEventInput[],
  anchorConfig: RotationAnchorConfig,
  slotsByEventId: Map<string, TeamSlotForRotation[]>,
  defaultTz = DEFAULT_TIME_ZONE
): ClassWeekLetter {
  const override = normalizeWeekOverride(event.class_week_override);
  if (override) return override;

  const ordered = filterAndSortTuesdayClassEvents(allEvents, defaultTz);
  const eventId = String(event.id);
  const idx = ordered.findIndex((e) => String(e.id) === eventId);
  if (idx < 0) return anchorConfig.anchor_week;

  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i--) {
      const prior = ordered[i];
      const priorWeek = resolveEffectiveWeekForEvent(prior, slotsByEventId);
      if (priorWeek) return nextWeekLetter(priorWeek);
    }
  }

  const anchorYmd = anchorConfig.anchor_date;
  const onOrAfterAnchor = ordered.filter((e) => {
    const tz = e.time_zone || defaultTz;
    const ymd = getDateStringInTimeZone(e.starts_at!, tz);
    return ymd >= anchorYmd;
  });

  const anchorIndex = onOrAfterAnchor.findIndex((e) => String(e.id) === eventId);
  if (anchorIndex >= 0) {
    return weekFromAnchorIndex(anchorIndex, anchorConfig.anchor_week);
  }

  return anchorConfig.anchor_week;
}

export function beginnerPositionsForWeek(week: ClassWeekLetter): [string, string] {
  return [
    `Beginner Lead Teacher Week ${week}`,
    `Beginner Follow Teacher Week ${week}`,
  ];
}

export function isBeginnerWeekPosition(position: string): boolean {
  return /Beginner (Lead|Follow) Teacher Week [ABC]/i.test((position || "").trim());
}
