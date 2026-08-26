import { DEFAULT_UPPER_LEVEL_NAMES } from "@/lib/nashvilleEventTitle";
import { supabaseServer } from "@/lib/supabaseServer";

const CLASS_INTRO = "This is your one stop shop for weekly country swing fun! ";
const DEFAULT_BEGINNER_SENTENCE = "our team of amazing beginner instructors lead the beginner class scheduled weeks";
const SEP = " will be instructing the upper level class while ";

function getWeekLetterFromPosition(position: string): string | null {
  const m = position.match(/Week ([ABC])/i);
  return m ? m[1].toUpperCase() : null;
}

function parseUpperNamesFromDescription(description: string): string {
  const idx = description.indexOf(SEP);
  if (idx === -1) return DEFAULT_UPPER_LEVEL_NAMES;
  const upperNames = description.slice(0, idx).replace(CLASS_INTRO, "").trim();
  return upperNames || DEFAULT_UPPER_LEVEL_NAMES;
}

function buildClassDescription(upperNames: string, beginnerPart: string): string {
  return CLASS_INTRO + upperNames + SEP + beginnerPart;
}

/**
 * Recomputes the Class event description from current team_slots (beginner positions + assignees)
 * and updates the event's description in the DB. No-op if event is not found or type is not "class".
 * Call after instructor signup, cancel, or admin assign/unassign (and optionally slot delete).
 */
export async function updateClassEventDescriptionFromSchedule(eventId: string): Promise<void> {
  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("id, type, description")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) return;
  if ((event.type || "").trim().toLowerCase() !== "class") return;

  const { data: slots, error: slotsError } = await supabaseServer
    .from("team_slots")
    .select("id, position, assignee_id")
    .eq("event_id", eventId);

  if (slotsError) {
    console.error("classDescriptionSync: failed to fetch slots", slotsError);
    return;
  }

  const slotList = slots || [];
  const assigneeIds = [...new Set(slotList.map((s: { assignee_id: string | null }) => s.assignee_id).filter(Boolean))] as string[];

  let profilesMap = new Map<string, { first_name?: string; last_name?: string }>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabaseServer
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", assigneeIds);
    profilesMap = new Map((profiles || []).map((p: { id: string; first_name?: string; last_name?: string }) => [p.id, p]));
  }

  const beginnerSlots = slotList.filter(
    (s: { position: string; assignee_id: string | null }) =>
      s.position && s.position.toLowerCase().includes("beginner") && s.assignee_id
  );

  const weekLetter = beginnerSlots.length > 0 ? getWeekLetterFromPosition(beginnerSlots[0].position) : null;
  const firstNames = [...new Set(
    beginnerSlots
      .map((s: { assignee_id: string }) => (profilesMap.get(s.assignee_id)?.first_name || "").trim())
      .filter(Boolean)
  )];

  let beginnerPart: string;
  if (firstNames.length > 0 && weekLetter) {
    beginnerPart =
      firstNames.length === 1
        ? `${firstNames[0]} will be teaching Beginner Week ${weekLetter}!`
        : firstNames.length === 2
          ? `${firstNames[0]} and ${firstNames[1]} will be teaching Beginner Week ${weekLetter}!`
          : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]} will be teaching Beginner Week ${weekLetter}!`;
  } else {
    beginnerPart = DEFAULT_BEGINNER_SENTENCE;
  }

  const upperNames = parseUpperNamesFromDescription(event.description || "");
  const builtDescription = buildClassDescription(upperNames, beginnerPart);

  const { error: updateError } = await supabaseServer
    .from("events")
    .update({ description: builtDescription })
    .eq("id", eventId);

  if (updateError) {
    console.error("classDescriptionSync: failed to update event description", updateError);
  }
}
