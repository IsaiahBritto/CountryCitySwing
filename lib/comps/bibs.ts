import { supabaseServer } from "@/lib/supabaseServer";

export interface BibPerson {
  firstName: string;
  lastName: string;
  email?: string | null;
}

const FIRST_BIB_NUMBER = 100;

/**
 * Finds or creates the per-event bib for a person. Bibs are per event: the
 * same person keeps one number across every competition they enter. Matches
 * by email when available, otherwise by full name (case-insensitive).
 */
export async function ensureBib(
  eventId: string,
  person: BibPerson
): Promise<string | null> {
  const first = (person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  const email = (person.email ?? "").trim().toLowerCase() || null;
  if (!first && !last && !email) return null;

  const { data: existing } = await supabaseServer
    .from("comp_bibs")
    .select("id, first_name, last_name, email")
    .eq("event_id", eventId);

  for (const bib of existing ?? []) {
    if (email && (bib.email ?? "").trim().toLowerCase() === email) return bib.id;
  }
  for (const bib of existing ?? []) {
    const sameName =
      (bib.first_name ?? "").trim().toLowerCase() === first.toLowerCase() &&
      (bib.last_name ?? "").trim().toLowerCase() === last.toLowerCase();
    if (sameName && (first || last)) return bib.id;
  }

  const { data: maxRow } = await supabaseServer
    .from("comp_bibs")
    .select("bib_number")
    .eq("event_id", eventId)
    .order("bib_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNumber = Math.max(FIRST_BIB_NUMBER, (maxRow?.bib_number ?? 0) + 1);

  const { data: created, error } = await supabaseServer
    .from("comp_bibs")
    .insert([
      {
        event_id: eventId,
        first_name: first,
        last_name: last,
        email,
        bib_number: nextNumber,
      },
    ])
    .select("id")
    .single();
  if (error) {
    // Unique collision from a concurrent insert: retry once.
    const { data: retry, error: retryError } = await supabaseServer
      .from("comp_bibs")
      .insert([
        {
          event_id: eventId,
          first_name: first,
          last_name: last,
          email,
          bib_number: nextNumber + 1,
        },
      ])
      .select("id")
      .single();
    if (retryError) throw new Error("Failed to assign bib number");
    return retry.id;
  }
  return created.id;
}
