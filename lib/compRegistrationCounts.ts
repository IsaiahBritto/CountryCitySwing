import type { CompSignupRow } from "@/lib/comps/types";

export interface CompDivisionSummary {
  strictly: { couples: number };
  jnj: { total: number; lead: number; follow: number };
}

function hasJnJLeadIdentity(row: CompSignupRow): boolean {
  if (row.jnj_lead_profile_id?.trim()) return true;
  const first = (row.jnj_lead_first_name ?? "").trim();
  const last = (row.jnj_lead_last_name ?? "").trim();
  const email = (row.jnj_lead_email ?? "").trim();
  return !!(first || last || email);
}

function hasJnJFollowIdentity(row: CompSignupRow): boolean {
  if (row.jnj_follow_profile_id?.trim()) return true;
  const first = (row.jnj_follow_first_name ?? "").trim();
  const last = (row.jnj_follow_last_name ?? "").trim();
  const email = (row.jnj_follow_email ?? "").trim();
  return !!(first || last || email);
}

/** Counts by division for non-cancelled comp signups (full event roster). */
export function summarizeCompDivisionRegistrations(
  signups: CompSignupRow[]
): CompDivisionSummary {
  let couples = 0;
  let jnjTotal = 0;
  let jnjLead = 0;
  let jnjFollow = 0;

  for (const row of signups) {
    if (row.strictly_selected) couples += 1;
    if (row.jnj_selected) {
      jnjTotal += 1;
      if (hasJnJLeadIdentity(row)) jnjLead += 1;
      if (hasJnJFollowIdentity(row)) jnjFollow += 1;
    }
  }

  return {
    strictly: { couples },
    jnj: { total: jnjTotal, lead: jnjLead, follow: jnjFollow },
  };
}
