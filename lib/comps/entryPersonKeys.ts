import { personKeyFromFields } from "@/lib/comps/eventRegistrants";

export interface EntryPersonFields {
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string | null;
  lead_profile_id: string | null;
  follow_first_name: string;
  follow_last_name: string;
  follow_email: string | null;
  follow_profile_id: string | null;
  entry_kind: string;
  role: string | null;
}

/** Person keys tied to a comp_entries row (lead and/or follow). */
export function entryPersonKeys(entry: EntryPersonFields): string[] {
  const keys: string[] = [];
  const leadKey = personKeyFromFields(
    entry.lead_profile_id,
    entry.lead_email,
    entry.lead_first_name,
    entry.lead_last_name
  );
  const followKey = personKeyFromFields(
    entry.follow_profile_id,
    entry.follow_email,
    entry.follow_first_name,
    entry.follow_last_name
  );
  if (entry.entry_kind === "couple") {
    if (entry.lead_first_name || entry.lead_last_name || entry.lead_email)
      keys.push(leadKey);
    if (
      entry.follow_first_name ||
      entry.follow_last_name ||
      entry.follow_email
    )
      keys.push(followKey);
  } else if (entry.role === "follow") {
    keys.push(followKey);
  } else {
    keys.push(leadKey);
  }
  return keys;
}
