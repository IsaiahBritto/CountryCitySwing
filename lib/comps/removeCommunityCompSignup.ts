import { entryHasScores } from "@/lib/comps/registrantEditPolicy";
import { replaceJnJAssignmentsForSignup } from "@/lib/comps/jnjAssignmentsStore";
import { pruneBibsAfterSignupRemoval } from "@/lib/comps/pruneEventBibs";
import type { CompSignupRow } from "@/lib/comps/types";
import { supabaseServer } from "@/lib/supabaseServer";

export class RemoveCommunityCompSignupError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** Remove one community comp signup and its division entries (organizer cleanup). */
export async function removeCommunityCompSignup(
  eventId: string,
  signupId: string
): Promise<void> {
  const { data: signup, error: signupErr } = await supabaseServer
    .from("comp_signups")
    .select("*")
    .eq("id", signupId)
    .maybeSingle();

  if (signupErr || !signup) {
    throw new RemoveCommunityCompSignupError("Registration not found", 404);
  }
  if (String(signup.event_id) !== eventId) {
    throw new RemoveCommunityCompSignupError("Registration not found", 404);
  }

  const { data: entries, error: entErr } = await supabaseServer
    .from("comp_entries")
    .select("id, lead_bib_id, follow_bib_id")
    .eq("comp_signup_id", signupId);
  if (entErr) {
    throw new RemoveCommunityCompSignupError("Failed to load entries", 500);
  }

  for (const entry of entries ?? []) {
    if (await entryHasScores(entry.id)) {
      throw new RemoveCommunityCompSignupError(
        "Cannot remove this registration because it already has scores in a division.",
        409
      );
    }
  }

  const entryIds = (entries ?? []).map((e) => e.id);
  const entryBibIds = (entries ?? []).flatMap((e) => [
    e.lead_bib_id as string | null,
    e.follow_bib_id as string | null,
  ]);
  if (entryIds.length > 0) {
    await supabaseServer
      .from("comp_round_entries")
      .delete()
      .in("entry_id", entryIds);
    const { error: delEntErr } = await supabaseServer
      .from("comp_entries")
      .delete()
      .in("id", entryIds);
    if (delEntErr) {
      throw new RemoveCommunityCompSignupError("Failed to remove division entries", 500);
    }
  }

  await replaceJnJAssignmentsForSignup(signupId, []);

  await pruneBibsAfterSignupRemoval(
    eventId,
    signup as CompSignupRow,
    entryBibIds.filter((id): id is string => typeof id === "string" && !!id)
  );

  const { error: delSignupErr } = await supabaseServer
    .from("comp_signups")
    .delete()
    .eq("id", signupId);
  if (delSignupErr) {
    throw new RemoveCommunityCompSignupError("Failed to remove registration", 500);
  }
}