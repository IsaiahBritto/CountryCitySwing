import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import {
  chicagoDateRangeToUtcBounds,
  filterEventsInChicagoDateRange,
  type ScheduleEventDateRangeInput,
} from "@/lib/schedule/eventDateRange";

export const SCHEDULE_EVENT_COLUMNS =
  "id, title, starts_at, ends_at, location, type, time_zone, schedule_opens_at, class_week_override";

export type ScheduleEventRow = ScheduleEventDateRangeInput & {
  id: string | number;
  title: string;
  location?: string | null;
  schedule_opens_at?: string | null;
  class_week_override?: string | null;
};

export async function fetchEventsForChicagoDateRange(
  from: string,
  to: string
): Promise<ScheduleEventRow[]> {
  const { rangeStartIso, rangeEndIso } = chicagoDateRangeToUtcBounds(from, to);

  const { data, error } = await supabaseServer
    .from("events")
    .select(SCHEDULE_EVENT_COLUMNS)
    .lte("starts_at", rangeEndIso)
    .or(`ends_at.is.null,ends_at.gte.${rangeStartIso}`)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return filterEventsInChicagoDateRange(
    (data || []) as ScheduleEventRow[],
    from,
    to
  );
}

export async function fetchAllEventsOrdered(): Promise<ScheduleEventRow[]> {
  const { data, error } = await supabaseServer
    .from("events")
    .select(SCHEDULE_EVENT_COLUMNS)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as ScheduleEventRow[];
}
