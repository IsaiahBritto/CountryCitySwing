import { supabaseServer } from "@/lib/supabaseServer";
import {
  DEFAULT_SOCIAL_VENUE_COST,
  SOCIAL_EVENT_DOOR_PAYOUT,
  isSocialDoorPayoutModel,
  normalizeDoorPayouts,
} from "@/lib/socialFinancesConstants";
import { mergeDoorPayoutsFromSlots } from "@/lib/socialDoorPayoutsMerge";
import { isSocialEventType } from "@/lib/socialScheduleSlots";
import {
  fetchSocialFinancesByEventId,
  writeSocialFinancesInsert,
  writeSocialFinancesUpdate,
} from "@/lib/socialFinancesDb";

/**
 * Sync filled Doorman schedule slots into the_social_finances.door_payouts for post-cutoff Socials.
 * Preserves amount_override and paid_at when slot_id matches.
 */
export async function syncSocialDoorPayoutsFromSchedule(eventId: string): Promise<void> {
  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("id, type, starts_at, time_zone")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) return;
  if (!isSocialEventType(event.type)) return;
  if (!isSocialDoorPayoutModel(event.starts_at, event.time_zone)) return;

  const { data: slots, error: slotsError } = await supabaseServer
    .from("team_slots")
    .select("id, position, assignee_id, slot_starts_at")
    .eq("event_id", eventId);

  if (slotsError) {
    console.error("socialDoorFinanceSync: failed to fetch slots", slotsError);
    return;
  }

  const slotList = (slots || []) as {
    id: string;
    position: string | null;
    assignee_id: string | null;
    slot_starts_at: string | null;
  }[];

  const assigneeIds = [
    ...new Set(slotList.map((s) => s.assignee_id).filter(Boolean)),
  ] as string[];

  let profilesMap = new Map<string, { first_name?: string | null; last_name?: string | null }>();
  if (assigneeIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", assigneeIds);

    if (profilesError) {
      console.error("socialDoorFinanceSync: failed to fetch profiles", profilesError);
      return;
    }
    profilesMap = new Map(
      (profiles || []).map(
        (p: { id: string; first_name?: string | null; last_name?: string | null }) => [p.id, p]
      )
    );
  }

  const slotsWithAssignees = slotList.map((slot) => ({
    ...slot,
    assignee: slot.assignee_id ? profilesMap.get(slot.assignee_id) ?? null : null,
  }));

  const { data: existing } = await fetchSocialFinancesByEventId(eventId);
  const doorPayouts = mergeDoorPayoutsFromSlots({
    existingRows: normalizeDoorPayouts(existing?.door_payouts),
    slots: slotsWithAssignees,
    defaultAmount: SOCIAL_EVENT_DOOR_PAYOUT,
  });

  const now = new Date().toISOString();

  if (existing) {
    const { error } = await writeSocialFinancesUpdate(eventId, {
      door_payouts: doorPayouts,
      brandon_profit: 0,
      kyler_profit: 0,
      brandon_split_ratio: 0,
      kyler_split_ratio: 0,
      updated_at: now,
    });
    if (error) {
      console.error("socialDoorFinanceSync: failed to update", error);
    }
    return;
  }

  const { error: insertError } = await writeSocialFinancesInsert({
    event_id: eventId,
    venue_cost: DEFAULT_SOCIAL_VENUE_COST,
    other_expense: 0,
    other_expense_comment: null,
    door_payouts: doorPayouts,
    brandon_split_ratio: 0,
    kyler_split_ratio: 0,
    isaiah_split_ratio: 1,
    brandon_profit: 0,
    kyler_profit: 0,
    isaiah_profit: 0,
    ccs_profit: 0,
    ccs_cash_profit: 0,
    brandon_paid_at: null,
    kyler_paid_at: null,
    isaiah_paid_at: null,
    updated_at: now,
  });

  if (insertError) {
    console.error("socialDoorFinanceSync: failed to insert", insertError);
  }
}

export { normalizeDoorPayouts } from "@/lib/socialFinancesConstants";
