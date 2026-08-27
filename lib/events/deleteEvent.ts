import { supabaseServer } from "@/lib/supabaseServer";
import { deleteCompetitionFully } from "@/lib/comps/deleteCompetition";

async function deleteRowsByEventId(
  table: string,
  eventId: string
): Promise<void> {
  const { error } = await supabaseServer
    .from(table)
    .delete()
    .eq("event_id", eventId);
  if (error) {
    throw new Error(`Failed to delete ${table}: ${error.message}`);
  }
}

/** Permanently remove an event and all related records. */
export async function deleteEventFully(eventId: string): Promise<void> {
  const { data: event } = await supabaseServer
    .from("events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    throw new Error("Event not found");
  }

  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id")
    .eq("event_id", eventId);

  for (const competition of competitions ?? []) {
    await deleteCompetitionFully(competition.id);
  }

  await deleteRowsByEventId("comp_signups", eventId);
  await deleteRowsByEventId("comp_bibs", eventId);
  await deleteRowsByEventId("comp_event_staff", eventId);
  await deleteRowsByEventId("comp_judge_payouts", eventId);
  await deleteRowsByEventId("comp_finances", eventId);
  await deleteRowsByEventId("signups", eventId);
  await deleteRowsByEventId("class_event_finance_payouts", eventId);
  await deleteRowsByEventId("team_slots", eventId);
  await deleteRowsByEventId("nashville_night_finances", eventId);
  await deleteRowsByEventId("the_social_finances", eventId);
  await deleteRowsByEventId("event_finance_metrics", eventId);
  await deleteRowsByEventId("workshop_finances", eventId);

  const { error } = await supabaseServer
    .from("events")
    .delete()
    .eq("id", eventId);
  if (error) {
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}
