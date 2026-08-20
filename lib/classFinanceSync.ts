import { DEFAULT_UPPER_LEVEL_TEACHER, isNashvilleNightTitle } from "@/lib/nashvilleEventTitle";
import { supabaseServer } from "@/lib/supabaseServer";

const BEGINNER_LEAD_POSITION = "beginner lead teacher";
const BEGINNER_FOLLOW_POSITION = "beginner follow teacher";
const BT1_FALLBACK = "Beginner Teacher 1";
const BT2_FALLBACK = "Beginner Teacher 2";

interface SlotRow {
  id: string;
  position: string;
  assignee_id: string | null;
}

function toDisplayName(profile?: { first_name?: string | null; last_name?: string | null }): string {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

async function ensureClassFinanceBaseRow(eventId: string): Promise<void> {
  const { data: existing, error: existingError } = await supabaseServer
    .from("nashville_night_finances")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingError) {
    console.error("classFinanceSync: failed to check existing finance row", existingError);
    return;
  }
  if (existing) return;

  const now = new Date().toISOString();
  const { error: insertError } = await supabaseServer.from("nashville_night_finances").insert({
    event_id: eventId,
    venue_cost: 0,
    cash_override: null,
    stripe_override: null,
    bt1_name: BT1_FALLBACK,
    bt2_name: BT2_FALLBACK,
    bt3_name: null,
    bt4_name: null,
    upper_level_teacher_name: DEFAULT_UPPER_LEVEL_TEACHER,
    bt1_payout_override: null,
    bt2_payout_override: null,
    bt3_payout_override: null,
    bt4_payout_override: null,
    upper_level_payout_override: null,
    bt1_paid: false,
    bt1_paid_at: null,
    bt2_paid: false,
    bt2_paid_at: null,
    bt3_paid: false,
    bt3_paid_at: null,
    bt4_paid: false,
    bt4_paid_at: null,
    upper_level_paid: false,
    upper_level_paid_at: null,
    updated_at: now,
  });

  if (insertError) {
    console.error("classFinanceSync: failed to insert finance row", insertError);
  }
}

async function syncNashvilleTeachersFromSchedule(
  eventId: string,
  slotList: SlotRow[],
  profilesMap: Map<string, { first_name?: string | null; last_name?: string | null }>
): Promise<void> {
  const leadSlot = slotList.find((s) =>
    (s.position || "").toLowerCase().includes(BEGINNER_LEAD_POSITION)
  );
  const followSlot = slotList.find((s) =>
    (s.position || "").toLowerCase().includes(BEGINNER_FOLLOW_POSITION)
  );

  const bt1Name =
    toDisplayName(leadSlot?.assignee_id ? profilesMap.get(leadSlot.assignee_id) : undefined) ||
    BT1_FALLBACK;
  const bt2Name =
    toDisplayName(followSlot?.assignee_id ? profilesMap.get(followSlot.assignee_id) : undefined) ||
    BT2_FALLBACK;

  const now = new Date().toISOString();
  await ensureClassFinanceBaseRow(eventId);

  const { error: updateError } = await supabaseServer
    .from("nashville_night_finances")
    .update({
      bt1_name: bt1Name,
      bt2_name: bt2Name,
      updated_at: now,
    })
    .eq("event_id", eventId);

  if (updateError) {
    console.error("classFinanceSync: failed to update Nashville finance row", updateError);
  }
}

export async function syncClassFinancePayoutsFromSchedule(eventId: string): Promise<void> {
  const { data: slots, error: slotsError } = await supabaseServer
    .from("team_slots")
    .select("id, position, assignee_id")
    .eq("event_id", eventId);

  if (slotsError) {
    console.error("classFinanceSync: failed to fetch slots for payouts", slotsError);
    return;
  }

  const slotList = (slots || []) as SlotRow[];
  const filledSlots = slotList.filter((s) => s.assignee_id);
  if (filledSlots.length === 0) return;

  const assigneeIds = [...new Set(filledSlots.map((s) => s.assignee_id).filter(Boolean))] as string[];

  let profilesMap = new Map<string, { first_name?: string | null; last_name?: string | null }>();
  if (assigneeIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", assigneeIds);

    if (profilesError) {
      console.error("classFinanceSync: failed to fetch profiles for payouts", profilesError);
      return;
    }
    profilesMap = new Map(
      (profiles || []).map((p: { id: string; first_name?: string | null; last_name?: string | null }) => [
        p.id,
        p,
      ])
    );
  }

  const { data: existingPayouts, error: payoutsError } = await supabaseServer
    .from("class_event_finance_payouts")
    .select("id, team_slot_id")
    .eq("event_id", eventId);

  if (payoutsError) {
    console.error("classFinanceSync: failed to fetch existing payouts", payoutsError);
    return;
  }

  const existingSlotIds = new Set(
    (existingPayouts || [])
      .map((p: { team_slot_id?: string | null }) => p.team_slot_id)
      .filter(Boolean)
  );

  const maxSort =
    (existingPayouts || []).length > 0
      ? (existingPayouts || []).length
      : 0;

  const now = new Date().toISOString();
  let sortOrder = maxSort;

  for (const slot of filledSlots) {
    if (existingSlotIds.has(slot.id)) continue;

    const payeeName =
      toDisplayName(slot.assignee_id ? profilesMap.get(slot.assignee_id) : undefined) ||
      "Unassigned";
    sortOrder += 1;

    const { error: insertError } = await supabaseServer.from("class_event_finance_payouts").insert({
      event_id: eventId,
      team_slot_id: slot.id,
      role_label: (slot.position || "").trim(),
      payee_name: payeeName,
      amount: 0,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      console.error("classFinanceSync: failed to insert payout row", insertError);
    }
  }
}

export async function syncClassFinanceTeachersFromSchedule(eventId: string): Promise<void> {
  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("id, type, title")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) return;
  if ((event.type || "").trim().toLowerCase() !== "class") return;

  const { data: slots, error: slotsError } = await supabaseServer
    .from("team_slots")
    .select("id, position, assignee_id")
    .eq("event_id", eventId);

  if (slotsError) {
    console.error("classFinanceSync: failed to fetch slots", slotsError);
    return;
  }

  const slotList = (slots || []) as SlotRow[];
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
      console.error("classFinanceSync: failed to fetch profiles", profilesError);
      return;
    }
    profilesMap = new Map(
      (profiles || []).map((p: { id: string; first_name?: string | null; last_name?: string | null }) => [
        p.id,
        p,
      ])
    );
  }

  if (isNashvilleNightTitle(event.title)) {
    await syncNashvilleTeachersFromSchedule(eventId, slotList, profilesMap);
  } else {
    await ensureClassFinanceBaseRow(eventId);
    await syncClassFinancePayoutsFromSchedule(eventId);
  }
}
