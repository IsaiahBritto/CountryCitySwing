import type { CompSignupRow } from "@/lib/comps/types";
import type { EventDivisionRow } from "@/lib/comps/signupDivision";
import type { EventRegistrantRole } from "@/lib/comps/eventRegistrants";

export type JnJAssignmentRole = "lead" | "follow";

export interface JnJAssignment {
  competitionId: string;
  role: JnJAssignmentRole;
  sortOrder?: number;
}

export interface JnJAssignmentRow {
  id: string;
  comp_signup_id: string;
  competition_id: string;
  role: JnJAssignmentRole;
  sort_order: number;
}

function isJnJRole(v: unknown): v is JnJAssignmentRole {
  return v === "lead" || v === "follow";
}

/** Parse `jnj_assignments` from API body (snake or camel). */
export function parseJnJAssignmentsFromBody(
  body: Record<string, unknown>
): JnJAssignment[] | undefined {
  const raw =
    body.jnj_assignments ?? body.jnjAssignments ?? undefined;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: JnJAssignment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const competitionId =
      typeof r.competition_id === "string"
        ? r.competition_id.trim()
        : typeof r.competitionId === "string"
          ? r.competitionId.trim()
          : "";
    const role = r.role;
    if (!competitionId || !isJnJRole(role)) continue;
    const sortOrder =
      typeof r.sort_order === "number"
        ? r.sort_order
        : typeof r.sortOrder === "number"
          ? r.sortOrder
          : out.length;
    out.push({ competitionId, role, sortOrder });
  }
  out.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return out;
}

/** Build assignments from legacy signup row when junction table is empty. */
export function synthesizeJnJAssignmentsFromSignup(
  signup: CompSignupRow
): JnJAssignment[] {
  if (!signup.jnj_selected) return [];
  const compId = signup.jnj_competition_id?.trim();
  if (!compId) return [];

  const hasLead = !!(
    signup.jnj_lead_profile_id ||
    signup.jnj_lead_email?.trim() ||
    signup.jnj_lead_first_name?.trim()
  );
  const hasFollow = !!(
    signup.jnj_follow_profile_id ||
    signup.jnj_follow_email?.trim() ||
    signup.jnj_follow_first_name?.trim()
  );

  const role: JnJAssignmentRole = hasFollow && !hasLead ? "follow" : "lead";
  return [{ competitionId: compId, role, sortOrder: 0 }];
}

export function jnjAssignmentToRegistrantRole(
  role: JnJAssignmentRole
): EventRegistrantRole {
  return role === "lead" ? "jnj_lead" : "jnj_follow";
}

export function validateJnJAssignments(
  assignments: JnJAssignment[],
  competitions: EventDivisionRow[],
  jnjSelected: boolean
): { error: string; status: number } | JnJAssignment[] {
  if (!jnjSelected) {
    if (assignments.length > 0) {
      return { error: "JnJ assignments provided but JnJ not selected", status: 400 };
    }
    return [];
  }
  if (assignments.length === 0) {
    return { error: "JnJ: choose division and role", status: 400 };
  }
  if (assignments.length > 2) {
    return { error: "At most two JnJ divisions per registration", status: 400 };
  }

  const jnjPool = competitions.filter(
    (c) => c.comp_type === "jack_and_jill" && !c.test_comp
  );
  const jnjIds = new Set(jnjPool.map((c) => c.id));

  const seenComp = new Set<string>();
  const seenRole = new Set<JnJAssignmentRole>();

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]!;
    if (!jnjIds.has(a.competitionId)) {
      return { error: "Invalid JnJ division for this event", status: 400 };
    }
    if (seenComp.has(a.competitionId)) {
      return { error: "Cannot enter the same JnJ division twice", status: 400 };
    }
    seenComp.add(a.competitionId);
    if (seenRole.has(a.role)) {
      return { error: "JnJ dual signup requires opposite roles", status: 400 };
    }
    seenRole.add(a.role);
    a.sortOrder = i;
  }

  if (assignments.length === 1 && jnjPool.length > 1 && !assignments[0]!.competitionId) {
    return { error: "Choose a JnJ division", status: 400 };
  }

  return assignments;
}

/** Primary JnJ competition id (sort_order 0). */
export function primaryJnJCompetitionId(assignments: JnJAssignment[]): string | null {
  if (assignments.length === 0) return null;
  const sorted = [...assignments].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
  return sorted[0]!.competitionId;
}

export function computeExpectedJnJLineTotal(
  jnjUnitPrice: number | null | undefined,
  assignmentCount: number
): number {
  if (!assignmentCount || jnjUnitPrice == null) return 0;
  const unit = Number(jnjUnitPrice);
  if (!Number.isFinite(unit) || unit < 0) return 0;
  return Math.round(unit * assignmentCount * 100) / 100;
}

export function computeExpectedCompSignupTotal(params: {
  strictlySelected: boolean;
  strictlyPrice: number | null | undefined;
  jnjSelected: boolean;
  jnjPrice: number | null | undefined;
  jnjAssignmentCount: number;
  allAmericanSelected?: boolean;
  allAmericanPrice?: number | null;
}): number {
  let total = 0;
  if (params.strictlySelected && params.strictlyPrice != null) {
    total += Number(params.strictlyPrice) || 0;
  }
  if (params.jnjSelected) {
    total += computeExpectedJnJLineTotal(
      params.jnjPrice,
      Math.max(1, params.jnjAssignmentCount)
    );
  }
  if (params.allAmericanSelected && params.allAmericanPrice != null) {
    total += Number(params.allAmericanPrice) || 0;
  }
  return Math.round(total * 100) / 100;
}

/** Mirror registrant identity into comp_signups lead/follow columns from assignments. */
export function signupSlotPatchFromAssignments(
  assignments: JnJAssignment[],
  identity: {
    firstName: string;
    lastName: string;
    email?: string | null;
    profileId: string | null;
  }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    jnj_selected: assignments.length > 0,
    jnj_competition_id: primaryJnJCompetitionId(assignments),
  };

  const clearLead = {
    jnj_lead_first_name: null,
    jnj_lead_last_name: null,
    jnj_lead_email: null,
    jnj_lead_profile_id: null,
  };
  const clearFollow = {
    jnj_follow_first_name: null,
    jnj_follow_last_name: null,
    jnj_follow_email: null,
    jnj_follow_profile_id: null,
  };

  const email = identity.email?.trim().toLowerCase() || null;
  const fillSide = (side: JnJAssignmentRole) => ({
    [`jnj_${side}_first_name`]: identity.firstName.trim(),
    [`jnj_${side}_last_name`]: identity.lastName.trim(),
    [`jnj_${side}_email`]: email,
    [`jnj_${side}_profile_id`]: identity.profileId,
  });

  const rolesNeeded = new Set(assignments.map((a) => a.role));
  if (rolesNeeded.has("lead")) Object.assign(patch, fillSide("lead"));
  else Object.assign(patch, clearLead);
  if (rolesNeeded.has("follow")) Object.assign(patch, fillSide("follow"));
  else Object.assign(patch, clearFollow);

  return patch;
}

export function assignmentsFromSingleLegacy(
  competitionId: string | null | undefined,
  jnjRole: JnJAssignmentRole | null | undefined
): JnJAssignment[] {
  if (!competitionId?.trim() || !jnjRole) return [];
  return [{ competitionId: competitionId.trim(), role: jnjRole, sortOrder: 0 }];
}

export function jnjAssignmentsChanged(
  current: JnJAssignment[],
  next: JnJAssignment[] | undefined
): boolean {
  if (next === undefined) return false;
  if (current.length !== next.length) return true;
  const sort = (list: JnJAssignment[]) =>
    [...list].sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.competitionId.localeCompare(b.competitionId)
    );
  const a = sort(current);
  const b = sort(next);
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.competitionId !== b[i]!.competitionId) return true;
    if (a[i]!.role !== b[i]!.role) return true;
  }
  return false;
}

export function tierForCompetitionId(
  tiersByCompetition: { competitionId: string; tier: string }[],
  competitionId: string
): "full" | "limited" {
  const row = tiersByCompetition.find((t) => t.competitionId === competitionId);
  return row?.tier === "limited" ? "limited" : "full";
}

/** Whether signup has an assignment for this competition (junction or legacy primary). */
export function signupHasJnJAssignmentForCompetition(
  signup: CompSignupRow,
  assignments: JnJAssignment[],
  competitionId: string
): JnJAssignment | null {
  const fromTable = assignments.find((a) => a.competitionId === competitionId);
  if (fromTable) return fromTable;
  if (signup.jnj_competition_id === competitionId && signup.jnj_selected) {
    return synthesizeJnJAssignmentsFromSignup(signup).find(
      (a) => a.competitionId === competitionId
    ) ?? null;
  }
  return null;
}
