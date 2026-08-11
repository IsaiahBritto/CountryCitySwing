import { supabaseServer } from "@/lib/supabaseServer";
import {
  type BibAssignment,
  type BibPerson,
  validateBibNumberAssignments,
} from "@/lib/comps/eventRegistrants";

export type { BibAssignment, BibPerson } from "@/lib/comps/eventRegistrants";
export {
  collectEventRegistrants,
  personKeyFromFields,
  ROLE_LABEL,
  validateBibNumberAssignments,
  type EventRegistrantPerson,
  type EventRegistrantRole,
} from "@/lib/comps/eventRegistrants";

const normEmail = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

const normName = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

async function loadEventBibs(eventId: string) {
  const { data } = await supabaseServer
    .from("comp_bibs")
    .select("id, first_name, last_name, email, profile_id, bib_number")
    .eq("event_id", eventId);
  return data ?? [];
}

function findExistingBibId(
  existing: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    profile_id: string | null;
  }[],
  person: BibPerson
): string | null {
  const first = (person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  const email = normEmail(person.email) || null;
  const profileId = person.profileId?.trim() || null;
  if (!first && !last && !email && !profileId) return null;

  if (profileId) {
    for (const bib of existing) {
      if (bib.profile_id === profileId) return bib.id;
    }
  }

  for (const bib of existing) {
    if (email && normEmail(bib.email) === email) return bib.id;
  }

  for (const bib of existing) {
    const sameName =
      normName(bib.first_name) === normName(first) &&
      normName(bib.last_name) === normName(last);
    if (sameName && (first || last)) return bib.id;
  }

  return null;
}

function hasPersonFields(person: BibPerson): boolean {
  const first = (person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  const email = normEmail(person.email);
  const profileId = person.profileId?.trim() || "";
  return !!(first || last || email || profileId);
}

/**
 * Finds or creates the per-event bib record for a person without assigning a
 * number. Matches by profile_id, then email, then full name.
 */
export async function findOrCreateBibRecord(
  eventId: string,
  person: BibPerson
): Promise<string | null> {
  if (!hasPersonFields(person)) return null;

  const first = (person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  const email = normEmail(person.email) || null;
  const profileId = person.profileId?.trim() || null;

  const existing = await loadEventBibs(eventId);
  const foundId = findExistingBibId(existing, person);
  if (foundId) {
    if (profileId) {
      const row = existing.find((b) => b.id === foundId);
      if (row && !row.profile_id) {
        await supabaseServer
          .from("comp_bibs")
          .update({ profile_id: profileId })
          .eq("id", foundId);
      }
    }
    return foundId;
  }

  const { data: created, error } = await supabaseServer
    .from("comp_bibs")
    .insert([
      {
        event_id: eventId,
        first_name: first,
        last_name: last,
        email,
        profile_id: profileId,
        bib_number: null,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error("Failed to create bib record");
  return created.id;
}

/** @deprecated Use findOrCreateBibRecord — no longer auto-assigns numbers. */
export const ensureBib = findOrCreateBibRecord;

/** Admin bulk save of bib numbers for an event. */
export async function assignBibNumbers(
  eventId: string,
  assignments: BibAssignment[]
): Promise<{ error: string } | { ok: true }> {
  const validationError = validateBibNumberAssignments(assignments);
  if (validationError) return { error: validationError };

  const existing = await loadEventBibs(eventId);
  const byId = new Map(existing.map((b) => [b.id, b]));

  for (const { bibId } of assignments) {
    if (!byId.has(bibId)) {
      return { error: `Unknown bib record ${bibId}` };
    }
  }

  for (const other of existing) {
    if (other.bib_number == null) continue;
    const reassigned = assignments.find((a) => a.bibId === other.id);
    const num = reassigned ? reassigned.bibNumber : other.bib_number;
    const clash = assignments.find(
      (a) => a.bibId !== other.id && a.bibNumber === num
    );
    if (clash && !reassigned) {
      return {
        error: `Bib number ${num} is already assigned to another competitor`,
      };
    }
  }

  for (const { bibId, bibNumber } of assignments) {
    const { error } = await supabaseServer
      .from("comp_bibs")
      .update({ bib_number: bibNumber })
      .eq("id", bibId)
      .eq("event_id", eventId);
    if (error) {
      if (error.code === "23505") {
        return { error: `Bib number ${bibNumber} is already in use` };
      }
      return { error: "Failed to save bib numbers" };
    }
  }

  return { ok: true };
}
