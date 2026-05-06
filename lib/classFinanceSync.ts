import { supabaseServer } from "@/lib/supabaseServer";

const BEGINNER_LEAD_POSITION = "beginner lead teacher";
const BEGINNER_FOLLOW_POSITION = "beginner follow teacher";
const BT1_FALLBACK = "Beginner Teacher 1";
const BT2_FALLBACK = "Beginner Teacher 2";

interface SlotRow {
  position: string;
  assignee_id: string | null;
}

function toDisplayName(profile?: { first_name?: string | null; last_name?: string | null }): string {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

export async function syncClassFinanceTeachersFromSchedule(eventId: string): Promise<void> {
  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("id, type")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) return;
  if ((event.type || "").trim().toLowerCase() !== "class") return;

  const { data: slots, error: slotsError } = await supabaseServer
    .from("team_slots")
    .select("position, assignee_id")
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

  const leadSlot = slotList.find((s) => (s.position || "").toLowerCase().includes(BEGINNER_LEAD_POSITION));
  const followSlot = slotList.find((s) => (s.position || "").toLowerCase().includes(BEGINNER_FOLLOW_POSITION));

  const bt1Name = toDisplayName(leadSlot?.assignee_id ? profilesMap.get(leadSlot.assignee_id) : undefined) || BT1_FALLBACK;
  const bt2Name =
    toDisplayName(followSlot?.assignee_id ? profilesMap.get(followSlot.assignee_id) : undefined) || BT2_FALLBACK;

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabaseServer
    .from("nashville_night_finances")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingError) {
    console.error("classFinanceSync: failed to check existing finance row", existingError);
    return;
  }

  if (existing) {
    const { error: updateError } = await supabaseServer
      .from("nashville_night_finances")
      .update({
        bt1_name: bt1Name,
        bt2_name: bt2Name,
        updated_at: now,
      })
      .eq("event_id", eventId);

    if (updateError) {
      console.error("classFinanceSync: failed to update finance row", updateError);
    }
    return;
  }

  const { error: insertError } = await supabaseServer.from("nashville_night_finances").insert({
    event_id: eventId,
    venue_cost: 0,
    cash_override: null,
    stripe_override: null,
    bt1_name: bt1Name,
    bt2_name: bt2Name,
    bt3_name: null,
    bt4_name: null,
    upper_level_teacher_name: "Malissa",
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
