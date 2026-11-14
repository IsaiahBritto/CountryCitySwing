import { supabaseServer } from "@/lib/supabaseServer";
import { findOrCreateBibRecord } from "@/lib/comps/bibs";
import type { CompSignupRow } from "@/lib/comps/types";
import type { EventRegistrantRole } from "@/lib/comps/eventRegistrants";
import { entryHasScores } from "@/lib/comps/registrantEditPolicy";
import {
  type JnJAssignment,
  jnjAssignmentToRegistrantRole,
  signupSlotPatchFromAssignments,
  tierForCompetitionId,
} from "@/lib/comps/jnjAssignments";
import { replaceJnJAssignmentsForSignup } from "@/lib/comps/jnjAssignmentsStore";
import { RegistrantSyncError } from "@/lib/comps/registrantSyncErrors";

export interface RegistrantIdentityPatch {
  firstName: string;
  lastName: string;
  email?: string | null;
}
import type { ResolvedRegistrant } from "@/lib/comps/registrantResolve";
import type { EventDivisionRow } from "@/lib/comps/signupDivision";
import { STRUCTURAL_EDIT_BLOCKED_MESSAGE } from "@/lib/comps/registrantEditPolicy";

export async function swapJnJOnSignup(
  signup: CompSignupRow
): Promise<CompSignupRow> {
  const patch = {
    jnj_lead_first_name: signup.jnj_follow_first_name,
    jnj_lead_last_name: signup.jnj_follow_last_name,
    jnj_lead_email: signup.jnj_follow_email,
    jnj_lead_profile_id: signup.jnj_follow_profile_id,
    jnj_follow_first_name: signup.jnj_lead_first_name,
    jnj_follow_last_name: signup.jnj_lead_last_name,
    jnj_follow_email: signup.jnj_lead_email,
    jnj_follow_profile_id: signup.jnj_lead_profile_id,
  };
  const { error } = await supabaseServer
    .from("comp_signups")
    .update(patch)
    .eq("id", signup.id);
  if (error) throw new RegistrantSyncError("Failed to update signup", 500);
  return { ...signup, ...patch } as CompSignupRow;
}

export async function swapJnJEntry(
  entryId: string,
  eventId: string
): Promise<void> {
  const { data: entry } = await supabaseServer
    .from("comp_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.entry_kind !== "individual") return;
  if (entry.source_lead_entry_id) return;

  const wasLead = entry.role === "lead";
  const newRole = wasLead ? "follow" : "lead";

  let leadBib = entry.lead_bib_id;
  let followBib = entry.follow_bib_id;

  if (wasLead) {
    followBib = await findOrCreateBibRecord(eventId, {
      firstName: entry.lead_first_name,
      lastName: entry.lead_last_name,
      email: entry.lead_email,
      profileId: entry.lead_profile_id,
    });
    leadBib = null;
  } else {
    leadBib = await findOrCreateBibRecord(eventId, {
      firstName: entry.follow_first_name,
      lastName: entry.follow_last_name,
      email: entry.follow_email,
      profileId: entry.follow_profile_id,
    });
    followBib = null;
  }

  const { error } = await supabaseServer
    .from("comp_entries")
    .update({
      role: newRole,
      lead_first_name: entry.follow_first_name,
      lead_last_name: entry.follow_last_name,
      lead_email: entry.follow_email,
      lead_profile_id: entry.follow_profile_id,
      follow_first_name: entry.lead_first_name,
      follow_last_name: entry.lead_last_name,
      follow_email: entry.lead_email,
      follow_profile_id: entry.lead_profile_id,
      lead_bib_id: leadBib,
      follow_bib_id: followBib,
    })
    .eq("id", entryId);
  if (error) throw new RegistrantSyncError("Failed to swap JnJ entry", 500);
}

async function findJnJEntry(
  competitionId: string,
  signupId: string,
  role: "lead" | "follow"
): Promise<{ id: string; source_lead_entry_id?: string | null } | null> {
  const { data } = await supabaseServer
    .from("comp_entries")
    .select("id, role, entry_kind, source_lead_entry_id")
    .eq("competition_id", competitionId)
    .eq("comp_signup_id", signupId);
  const rows = data ?? [];
  return (
    rows.find(
      (e) =>
        e.entry_kind === "individual" &&
        e.role === role &&
        !e.source_lead_entry_id
    ) ?? null
  );
}

async function deleteJnJEntry(entryId: string): Promise<void> {
  if (await entryHasScores(entryId)) {
    throw new RegistrantSyncError(
      "Cannot remove division: entry already has scores",
      409
    );
  }
  const { error } = await supabaseServer
    .from("comp_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw new RegistrantSyncError("Failed to remove entry", 500);
}

async function importJnJEntryForAssignment(
  competitionId: string,
  eventId: string,
  signup: CompSignupRow,
  role: "lead" | "follow"
): Promise<void> {
  const existing = await findJnJEntry(competitionId, signup.id, role);
  if (existing) return;

  const prefix = role === "lead" ? "jnj_lead" : "jnj_follow";
  const first = String(signup[`${prefix}_first_name` as keyof CompSignupRow] ?? "");
  const last = String(signup[`${prefix}_last_name` as keyof CompSignupRow] ?? "");
  const email = (signup[`${prefix}_email` as keyof CompSignupRow] as string | null) ?? null;
  const profileId =
    (signup[`${prefix}_profile_id` as keyof CompSignupRow] as string | null) ?? null;

  if (role === "lead") {
    await supabaseServer.from("comp_entries").insert({
      competition_id: competitionId,
      entry_kind: "individual",
      role: "lead",
      lead_first_name: first,
      lead_last_name: last,
      lead_email: email,
      lead_profile_id: profileId,
      follow_first_name: "",
      follow_last_name: "",
      follow_email: null,
      follow_profile_id: null,
      lead_bib_id: await findOrCreateBibRecord(eventId, {
        firstName: first,
        lastName: last,
        email,
        profileId,
      }),
      follow_bib_id: null,
      comp_signup_id: signup.id,
    });
  } else {
    await supabaseServer.from("comp_entries").insert({
      competition_id: competitionId,
      entry_kind: "individual",
      role: "follow",
      lead_first_name: "",
      lead_last_name: "",
      lead_email: null,
      lead_profile_id: null,
      follow_first_name: first,
      follow_last_name: last,
      follow_email: email,
      follow_profile_id: profileId,
      lead_bib_id: null,
      follow_bib_id: await findOrCreateBibRecord(eventId, {
        firstName: first,
        lastName: last,
        email,
        profileId,
      }),
      comp_signup_id: signup.id,
    });
  }
}

function assignmentKey(a: JnJAssignment) {
  return `${a.competitionId}:${a.role}`;
}

export async function applyJnJAssignmentChanges(input: {
  eventId: string;
  resolved: ResolvedRegistrant;
  identity: RegistrantIdentityPatch;
  current: JnJAssignment[];
  next: JnJAssignment[];
  tiersByCompetition: ResolvedRegistrant["tiersByCompetition"];
  warnings: string[];
}): Promise<void> {
  const { eventId, resolved, identity, current, next, tiersByCompetition, warnings } =
    input;
  if (!jnjAssignmentsEqual(current, next)) {
    const affected = new Set<string>();
    for (const a of [...current, ...next]) affected.add(a.competitionId);
    for (const compId of affected) {
      if (tierForCompetitionId(tiersByCompetition, compId) === "limited") {
        throw new RegistrantSyncError(STRUCTURAL_EDIT_BLOCKED_MESSAGE, 409);
      }
    }
  }

  const primary = resolved.signupMatches[0];
  if (!primary) {
    if (next.length > 0) {
      warnings.push("No signup linked; JnJ division changes require a registration row.");
    }
    return;
  }

  const slotPatch = signupSlotPatchFromAssignments(
    next.length > 0 ? next : current,
    {
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      profileId: resolved.profileId,
    }
  );

  const { error: updErr } = await supabaseServer
    .from("comp_signups")
    .update(slotPatch)
    .eq("id", primary.signupId);
  if (updErr) throw new RegistrantSyncError("Failed to update signup", 500);

  await replaceJnJAssignmentsForSignup(primary.signupId, next);

  const { data: fresh } = await supabaseServer
    .from("comp_signups")
    .select("*")
    .eq("id", primary.signupId)
    .single();
  if (!fresh) return;
  const signup = fresh as CompSignupRow;
  primary.signup = signup;

  const currentMap = new Map(current.map((a) => [a.competitionId, a]));
  const nextMap = new Map(next.map((a) => [a.competitionId, a]));

  for (const [compId, oldA] of currentMap) {
    const newA = nextMap.get(compId);
    if (!newA) {
      const ent = await findJnJEntry(compId, primary.signupId, oldA.role);
      if (ent) await deleteJnJEntry(ent.id);
      continue;
    }
    if (newA.role === oldA.role) continue;

    const ent = await findJnJEntry(compId, primary.signupId, oldA.role);
    if (ent) {
      await swapJnJEntry(ent.id, eventId);
    } else {
      await importJnJEntryForAssignment(compId, eventId, signup, newA.role);
    }
  }

  for (const [compId, newA] of nextMap) {
    if (currentMap.has(compId)) continue;
    await importJnJEntryForAssignment(compId, eventId, signup, newA.role);
  }
}

function jnjAssignmentsEqual(a: JnJAssignment[], b: JnJAssignment[]): boolean {
  if (a.length !== b.length) return false;
  const keysA = new Set(a.map(assignmentKey));
  const keysB = new Set(b.map(assignmentKey));
  if (keysA.size !== keysB.size) return false;
  for (const k of keysA) if (!keysB.has(k)) return false;
  return true;
}

/** Derive checkbox roles payload from assignments (for legacy role sync path). */
export function rolesFromJnJAssignments(
  assignments: JnJAssignment[]
): { jnj_lead: boolean; jnj_follow: boolean } {
  const roles = new Set(assignments.map((a) => a.role));
  return {
    jnj_lead: roles.has("lead"),
    jnj_follow: roles.has("follow"),
  };
}

export function registrantRolesFromAssignments(
  assignments: JnJAssignment[]
): EventRegistrantRole[] {
  return assignments.map((a) => jnjAssignmentToRegistrantRole(a.role));
}

export function competitionIdsForJnJAssignments(
  assignments: JnJAssignment[],
  _comps: EventDivisionRow[],
  legacySingle?: string | null
): string[] {
  if (assignments.length > 0) return assignments.map((a) => a.competitionId);
  return legacySingle ? [legacySingle] : [];
}