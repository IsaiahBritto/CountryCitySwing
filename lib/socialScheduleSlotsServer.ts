import "server-only";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  buildSocialDoormanSlotWindows,
  isDoormanPosition,
  isSocialEventType,
  SOCIAL_DOORMAN_POSITION,
  type SocialDoormanWindow,
} from "@/lib/socialScheduleSlots";
import { DEFAULT_TIME_ZONE, isEventPastInChicago } from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Allow small drift between stored timestamptz and generated ISO strings. */
const SLOT_TIME_TOLERANCE_MS = 60_000;

type SocialEventLike = {
  type?: string | null;
  starts_at: string;
  ends_at?: string | null;
  time_zone?: string | null;
};

type SlotRow = {
  id: string;
  position?: string | null;
  created_at?: string | null;
  slot_starts_at?: string | null;
  slot_ends_at?: string | null;
  assignee_id?: string | null;
};

function timestampsMatch(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= SLOT_TIME_TOLERANCE_MS;
}

function slotMatchesWindow(slot: SlotRow, win: SocialDoormanWindow): boolean {
  if (!slot.slot_starts_at || !slot.slot_ends_at) return false;
  return (
    timestampsMatch(slot.slot_starts_at, win.slot_starts_at) &&
    timestampsMatch(slot.slot_ends_at, win.slot_ends_at)
  );
}

function isPlainDoorman(slot: SlotRow): boolean {
  return (
    (slot.position || "").trim() === SOCIAL_DOORMAN_POSITION &&
    !slot.slot_starts_at &&
    !slot.slot_ends_at
  );
}

function pickKeeperSlot(slots: SlotRow[]): SlotRow | undefined {
  if (slots.length === 0) return undefined;
  return [...slots].sort((a, b) => {
    if (a.assignee_id && !b.assignee_id) return -1;
    if (!a.assignee_id && b.assignee_id) return 1;
    return (a.created_at || "").localeCompare(b.created_at || "");
  })[0];
}

async function deleteSlotIfUnassigned(slotId: string): Promise<void> {
  const { error } = await supabaseServer.from("team_slots").delete().eq("id", slotId);
  if (error) {
    console.error("socialScheduleSlots: failed to delete duplicate slot", error);
  }
}

/**
 * Ensures exactly one Doorman team_slot per event hour for Social events.
 * Removes unassigned duplicate/extra Doorman rows.
 */
export async function ensureSocialDoormanSlots(
  eventId: string | number,
  event: SocialEventLike
): Promise<void> {
  if (!isSocialEventType(event.type) || !event.starts_at) return;

  const tz = event.time_zone || DEFAULT_TIME_ZONE;
  // Never infer duration from existing slot count (prevents runaway duplicates).
  const effectiveEndsAt = event.ends_at ?? null;

  const expectedWindows = buildSocialDoormanSlotWindows(
    event.starts_at,
    effectiveEndsAt,
    tz
  );

  const { data: existing, error: fetchError } = await supabaseServer
    .from("team_slots")
    .select("id, position, created_at, slot_starts_at, slot_ends_at, assignee_id")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (fetchError) {
    console.error("socialScheduleSlots: failed to fetch slots", fetchError);
    return;
  }

  const doormanSlots = ((existing || []) as SlotRow[]).filter((s) =>
    isDoormanPosition(s.position)
  );
  const keptIds = new Set<string>();
  const usedPlainIds = new Set<string>();

  for (const win of expectedWindows) {
    const matching = doormanSlots.filter((s) => slotMatchesWindow(s, win));
    let keeper = pickKeeperSlot(matching);

    if (!keeper) {
      const plain = doormanSlots.find((s) => isPlainDoorman(s) && !usedPlainIds.has(s.id));
      if (plain) {
        const { error: updateError } = await supabaseServer
          .from("team_slots")
          .update({
            position: SOCIAL_DOORMAN_POSITION,
            slot_starts_at: win.slot_starts_at,
            slot_ends_at: win.slot_ends_at,
          })
          .eq("id", plain.id);
        if (updateError) {
          console.error("socialScheduleSlots: failed to set Doorman slot times", updateError);
          continue;
        }
        usedPlainIds.add(plain.id);
        keeper = {
          ...plain,
          slot_starts_at: win.slot_starts_at,
          slot_ends_at: win.slot_ends_at,
        };
      } else {
        const { data: inserted, error: insertError } = await supabaseServer
          .from("team_slots")
          .insert({
            position: SOCIAL_DOORMAN_POSITION,
            event_id: eventId,
            slot_starts_at: win.slot_starts_at,
            slot_ends_at: win.slot_ends_at,
          })
          .select("id")
          .single();
        if (insertError) {
          console.error("socialScheduleSlots: failed to insert Doorman slot", insertError);
          continue;
        }
        keeper = {
          id: inserted.id,
          position: SOCIAL_DOORMAN_POSITION,
          slot_starts_at: win.slot_starts_at,
          slot_ends_at: win.slot_ends_at,
        };
      }
    }

    if (keeper) keptIds.add(keeper.id);

    for (const dup of matching) {
      if (dup.id !== keeper?.id && !dup.assignee_id) {
        await deleteSlotIfUnassigned(dup.id);
      }
    }
  }

  // Remove unassigned Doorman slots that are not one of the expected hour slots.
  for (const slot of doormanSlots) {
    if (keptIds.has(slot.id)) continue;
    if (slot.assignee_id) continue;
    await deleteSlotIfUnassigned(slot.id);
  }
}

/** Sync Doorman hour slots for upcoming Social events before returning schedule slots. */
export async function syncUpcomingSocialDoormanSlots(): Promise<void> {
  const { data: events, error } = await supabaseServer
    .from("events")
    .select("id, type, starts_at, ends_at, time_zone")
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("socialScheduleSlots: failed to fetch events for sync", error);
    return;
  }

  const upcoming = (events || []).filter(
    (e: { type?: string | null; starts_at: string; ends_at?: string | null }) =>
      isSocialEventType(e.type) &&
      e.starts_at &&
      !isEventPastInChicago(e.starts_at, e.ends_at ?? null)
  );

  await Promise.all(upcoming.map((e) => ensureSocialDoormanSlots(e.id, e)));
}
