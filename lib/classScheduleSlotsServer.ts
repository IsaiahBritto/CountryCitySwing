import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import { SOCIAL_DOORMAN_POSITION, isDoormanPosition } from "@/lib/socialScheduleSlots";
import {
  beginnerPositionsForWeek,
  isBeginnerWeekPosition,
  isTuesdayClassEvent,
  resolveWeekLetterForEvent,
  type ClassScheduleEventInput,
  type ClassWeekLetter,
  type RotationAnchorConfig,
  type TeamSlotForRotation,
} from "@/lib/classScheduleRotation";
import { DEFAULT_TIME_ZONE, isEventPastInChicago } from "@/lib/utils/dateHelpers";

const CLASS_DOORMAN_COUNT = 3;

type EventLike = ClassScheduleEventInput & {
  schedule_opens_at?: string | null;
  ends_at?: string | null;
};

type SlotRow = {
  id: string;
  position?: string | null;
  assignee_id?: string | null;
  created_at?: string | null;
  slot_starts_at?: string | null;
  slot_ends_at?: string | null;
};

export function isClassScheduleOpen(
  event: { schedule_opens_at?: string | null },
  now = new Date()
): boolean {
  if (!event.schedule_opens_at) return true;
  return new Date(event.schedule_opens_at).getTime() <= now.getTime();
}

export async function loadRotationAnchorConfig(): Promise<RotationAnchorConfig> {
  const { data, error } = await supabaseServer
    .from("class_schedule_rotation_config")
    .select("anchor_date, anchor_week")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return { anchor_date: "2025-09-29", anchor_week: "A" };
  }

  return {
    anchor_date: String(data.anchor_date),
    anchor_week: data.anchor_week as ClassWeekLetter,
  };
}

async function loadTuesdayClassEvents(): Promise<ClassScheduleEventInput[]> {
  const { data, error } = await supabaseServer
    .from("events")
    .select("id, type, starts_at, time_zone, class_week_override")
    .order("starts_at", { ascending: true });

  if (error || !data) return [];
  return (data as ClassScheduleEventInput[]).filter((e) => isTuesdayClassEvent(e));
}

async function loadSlotsByEventIds(eventIds: string[]): Promise<Map<string, TeamSlotForRotation[]>> {
  const map = new Map<string, TeamSlotForRotation[]>();
  if (eventIds.length === 0) return map;

  const { data, error } = await supabaseServer
    .from("team_slots")
    .select("event_id, position")
    .in("event_id", eventIds);

  if (error || !data) return map;

  for (const row of data as { event_id: string | number; position?: string }[]) {
    const key = String(row.event_id);
    const list = map.get(key) || [];
    list.push({ position: row.position });
    map.set(key, list);
  }
  return map;
}

async function deleteSlotIfUnassigned(slotId: string): Promise<void> {
  const { error } = await supabaseServer.from("team_slots").delete().eq("id", slotId);
  if (error) {
    console.error("classScheduleSlots: failed to delete slot", error);
  }
}

function isPlainClassDoorman(slot: SlotRow): boolean {
  return (
    isDoormanPosition(slot.position) &&
    !slot.slot_starts_at &&
    !slot.slot_ends_at
  );
}

/**
 * Ensures beginner week slots + 3 plain Doorman slots for a Tuesday Class event.
 */
export async function ensureClassTeamSlots(
  eventId: string | number,
  event: EventLike
): Promise<ClassWeekLetter | null> {
  if (!isTuesdayClassEvent(event)) return null;

  const anchor = await loadRotationAnchorConfig();
  const allTuesday = await loadTuesdayClassEvents();
  const eventIds = allTuesday.map((e) => String(e.id));
  const slotsByEvent = await loadSlotsByEventIds(eventIds);

  const week = resolveWeekLetterForEvent(
    { ...event, id: eventId },
    allTuesday,
    anchor,
    slotsByEvent
  );

  const [leadPos, followPos] = beginnerPositionsForWeek(week);
  const expectedBeginner = new Set([leadPos, followPos]);

  const { data: existing, error: fetchError } = await supabaseServer
    .from("team_slots")
    .select("id, position, assignee_id, created_at, slot_starts_at, slot_ends_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (fetchError) {
    console.error("classScheduleSlots: fetch slots failed", fetchError);
    return week;
  }

  const slots = (existing || []) as SlotRow[];

  for (const pos of [leadPos, followPos]) {
    const has = slots.some((s) => (s.position || "").trim() === pos);
    if (!has) {
      const { error: insertError } = await supabaseServer.from("team_slots").insert({
        position: pos,
        event_id: eventId,
      });
      if (insertError) {
        console.error("classScheduleSlots: insert beginner slot failed", insertError);
      }
    }
  }

  for (const slot of slots) {
    const pos = (slot.position || "").trim();
    if (!isBeginnerWeekPosition(pos)) continue;
    if (expectedBeginner.has(pos)) continue;
    if (slot.assignee_id) continue;
    await deleteSlotIfUnassigned(slot.id);
  }

  let currentPlain = slots.filter(isPlainClassDoorman);
  let doormanCount = currentPlain.length;

  while (doormanCount < CLASS_DOORMAN_COUNT) {
    const { error: insertError } = await supabaseServer.from("team_slots").insert({
      position: SOCIAL_DOORMAN_POSITION,
      event_id: eventId,
    });
    if (insertError) {
      console.error("classScheduleSlots: insert doorman failed", insertError);
      break;
    }
    doormanCount += 1;
  }

  const { data: afterInsert } = await supabaseServer
    .from("team_slots")
    .select("id, position, assignee_id, created_at, slot_starts_at, slot_ends_at")
    .eq("event_id", eventId);

  currentPlain = ((afterInsert || []) as SlotRow[]).filter(isPlainClassDoorman);
  doormanCount = currentPlain.length;

  if (doormanCount > CLASS_DOORMAN_COUNT) {
    const extras = [...currentPlain]
      .filter((s) => !s.assignee_id)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
      .slice(CLASS_DOORMAN_COUNT);
    for (const extra of extras) {
      await deleteSlotIfUnassigned(extra.id);
    }
  }

  return week;
}

export async function maybeEnsureClassTeamSlotsForEvent(
  eventId: string | number,
  event: EventLike
): Promise<void> {
  if (!isTuesdayClassEvent(event)) return;
  if (!isClassScheduleOpen(event)) return;
  try {
    await ensureClassTeamSlots(eventId, event);
  } catch (err) {
    console.error("classScheduleSlots: ensure failed", err);
  }
}

export async function syncDueClassSchedules(): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data: events, error } = await supabaseServer
    .from("events")
    .select(
      "id, type, starts_at, ends_at, time_zone, schedule_opens_at, class_week_override"
    )
    .eq("type", "Class")
    .not("schedule_opens_at", "is", null)
    .lte("schedule_opens_at", nowIso);

  if (error || !events) {
    console.error("classScheduleSlots: sync due fetch failed", error);
    return 0;
  }

  let count = 0;
  for (const ev of events as EventLike[]) {
    if (!isTuesdayClassEvent(ev)) continue;
    if (isEventPastInChicago(ev.starts_at!, ev.ends_at ?? null)) continue;
    await ensureClassTeamSlots(ev.id!, ev);
    count += 1;
  }
  return count;
}
