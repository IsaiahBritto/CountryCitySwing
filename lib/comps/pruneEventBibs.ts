import { personKeyFromFields } from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";
import { supabaseServer } from "@/lib/supabaseServer";

const normEmail = (v: string | null | undefined) =>
  typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : null;

async function bibStillReferenced(bibId: string): Promise<boolean> {
  const { count, error } = await supabaseServer
    .from("comp_entries")
    .select("id", { count: "exact", head: true })
    .or(`lead_bib_id.eq.${bibId},follow_bib_id.eq.${bibId}`);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Delete event bib rows that are not linked from any comp entry. */
export async function deleteUnreferencedEventBibs(bibIds: string[]): Promise<void> {
  const unique = [...new Set(bibIds.filter(Boolean))];
  for (const bibId of unique) {
    if (await bibStillReferenced(bibId)) continue;
    const { error } = await supabaseServer.from("comp_bibs").delete().eq("id", bibId);
    if (error) throw new Error(`Failed to delete bib: ${error.message}`);
  }
}

function signupPersonKeys(signup: CompSignupRow): Set<string> {
  const keys = new Set<string>();
  const add = (
    profileId: string | null | undefined,
    email: string | null | undefined,
    first: string | null | undefined,
    last: string | null | undefined
  ) => {
    if (!profileId?.trim() && !email?.trim() && !first?.trim() && !last?.trim()) {
      return;
    }
    keys.add(
      personKeyFromFields(
        profileId,
        email,
        first?.trim() ?? "",
        last?.trim() ?? ""
      )
    );
  };

  add(
    signup.jnj_lead_profile_id,
    signup.jnj_lead_email,
    signup.jnj_lead_first_name,
    signup.jnj_lead_last_name
  );
  add(
    signup.jnj_follow_profile_id,
    signup.jnj_follow_email,
    signup.jnj_follow_first_name,
    signup.jnj_follow_last_name
  );
  add(
    signup.strictly_lead_profile_id,
    signup.strictly_lead_email,
    signup.strictly_lead_first_name,
    signup.strictly_lead_last_name
  );
  add(
    signup.strictly_follow_profile_id,
    signup.strictly_follow_email,
    signup.strictly_follow_first_name,
    signup.strictly_follow_last_name
  );
  return keys;
}

/** Remove bibs tied to a deleted signup when nothing else references them. */
export async function pruneBibsAfterSignupRemoval(
  eventId: string,
  signup: CompSignupRow,
  entryBibIds: string[]
): Promise<void> {
  const { data: bibs, error } = await supabaseServer
    .from("comp_bibs")
    .select("id, first_name, last_name, email, profile_id")
    .eq("event_id", eventId);
  if (error) throw new Error("Failed to load bibs");

  const keys = signupPersonKeys(signup);
  const toDelete: string[] = [...entryBibIds];

  for (const bib of bibs ?? []) {
    const key = personKeyFromFields(
      bib.profile_id,
      bib.email,
      bib.first_name ?? "",
      bib.last_name ?? ""
    );
    if (keys.has(key)) {
      toDelete.push(bib.id);
      continue;
    }
    const email = normEmail(bib.email);
    for (const sEmail of [
      signup.jnj_lead_email,
      signup.jnj_follow_email,
      signup.strictly_lead_email,
      signup.strictly_follow_email,
    ]) {
      const n = normEmail(sEmail);
      if (n && email === n) toDelete.push(bib.id);
    }
  }

  await deleteUnreferencedEventBibs(toDelete);
}

/** Drop leftover event bibs that are not used by any comp entry (e.g. after signup purge). */
export async function pruneOrphanBibsForCommunityEvent(
  eventId: string
): Promise<void> {
  const { data: bibs, error } = await supabaseServer
    .from("comp_bibs")
    .select("id")
    .eq("event_id", eventId);
  if (error) throw new Error("Failed to load bibs");
  await deleteUnreferencedEventBibs((bibs ?? []).map((b) => b.id));
}