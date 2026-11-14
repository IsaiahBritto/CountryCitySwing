import { supabaseServer } from "@/lib/supabaseServer";
import { personKeyFromFields } from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";
import {
  synthesizeJnJAssignmentsFromSignup,
  type JnJAssignment,
  type JnJAssignmentRow,
} from "@/lib/comps/jnjAssignments";

export async function loadJnJAssignmentsForSignupIds(
  signupIds: string[]
): Promise<Map<string, JnJAssignment[]>> {
  const map = new Map<string, JnJAssignment[]>();
  if (signupIds.length === 0) return map;

  const { data, error } = await supabaseServer
    .from("comp_signup_jnj_assignments")
    .select("comp_signup_id, competition_id, role, sort_order")
    .in("comp_signup_id", signupIds)
    .order("sort_order", { ascending: true });

  if (error) throw new Error("Failed to load JnJ assignments");

  for (const row of (data ?? []) as JnJAssignmentRow[]) {
    const list = map.get(row.comp_signup_id) ?? [];
    list.push({
      competitionId: row.competition_id,
      role: row.role,
      sortOrder: row.sort_order,
    });
    map.set(row.comp_signup_id, list);
  }
  return map;
}

export async function replaceJnJAssignmentsForSignup(
  signupId: string,
  assignments: JnJAssignment[]
): Promise<void> {
  const { error: delErr } = await supabaseServer
    .from("comp_signup_jnj_assignments")
    .delete()
    .eq("comp_signup_id", signupId);
  if (delErr) throw new Error("Failed to clear JnJ assignments");

  if (assignments.length === 0) return;

  const rows = assignments.map((a, i) => ({
    comp_signup_id: signupId,
    competition_id: a.competitionId,
    role: a.role,
    sort_order: a.sortOrder ?? i,
  }));

  const { error: insErr } = await supabaseServer
    .from("comp_signup_jnj_assignments")
    .insert(rows);
  if (insErr) throw new Error("Failed to save JnJ assignments");
}

const normEmail = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : null;

export interface PersonJnJDuplicateContext {
  registrantProfileId: string;
  leadEmail: string | null;
  followEmail: string | null;
  leadProfileId: string | null;
  followProfileId: string | null;
  newAssignments: JnJAssignment[];
}

export async function checkJnJDuplicateAssignmentsForEvent(
  eventId: string,
  ctx: PersonJnJDuplicateContext
): Promise<boolean> {
  const { data: signups } = await supabaseServer
    .from("comp_signups")
    .select(
      "id, jnj_selected, jnj_competition_id, jnj_lead_email, jnj_follow_email, jnj_lead_profile_id, jnj_follow_profile_id, jnj_lead_first_name, jnj_lead_last_name, jnj_follow_first_name, jnj_follow_last_name"
    )
    .eq("event_id", eventId)
    .eq("jnj_selected", true)
    .neq("refunded_or_cancelled", "cancelled");

  if (!signups?.length) return false;

  const signupIds = signups.map((s) => s.id as string);
  const bySignup = await loadJnJAssignmentsForSignupIds(signupIds);

  const personKeys = new Set<string>();
  if (ctx.registrantProfileId) {
    personKeys.add(`profile:${ctx.registrantProfileId}`);
  }
  for (const id of [ctx.leadProfileId, ctx.followProfileId]) {
    if (id) personKeys.add(`profile:${id}`);
  }
  for (const email of [ctx.leadEmail, ctx.followEmail].map(normEmail)) {
    if (email) personKeys.add(`email:${email}`);
  }

  const newCompIds = new Set(ctx.newAssignments.map((a) => a.competitionId));

  for (const s of signups as CompSignupRow[]) {
    let assignments = bySignup.get(s.id) ?? [];
    if (assignments.length === 0) {
      assignments = synthesizeJnJAssignmentsFromSignup(s);
    }

    for (const a of assignments) {
      if (!newCompIds.has(a.competitionId)) continue;

      const side = a.role;
      const profileId =
        side === "lead" ? s.jnj_lead_profile_id : s.jnj_follow_profile_id;
      const email = side === "lead" ? s.jnj_lead_email : s.jnj_follow_email;
      const first =
        side === "lead" ? s.jnj_lead_first_name : s.jnj_follow_first_name;
      const last =
        side === "lead" ? s.jnj_lead_last_name : s.jnj_follow_last_name;

      const key = personKeyFromFields(
        profileId,
        email,
        first ?? "",
        last ?? ""
      );
      if (personKeys.has(key)) return true;
    }
  }

  return false;
}

export async function insertJnJAssignmentsAfterSignupCreate(
  signupId: string,
  assignments: JnJAssignment[]
): Promise<void> {
  if (assignments.length === 0) return;
  await replaceJnJAssignmentsForSignup(signupId, assignments);
}