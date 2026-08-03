import { supabaseServer } from "@/lib/supabaseServer";
import type { CompSignupProfile } from "@/lib/compSignupAuth";

type DanceRole = "lead" | "follow";

export interface CompSignupRequestBody {
  strictly_selected?: boolean;
  jnj_selected?: boolean;
  strictly_role?: string | null;
  jnj_role?: string | null;
  registrant_profile_id?: string | null;
  strictly_lead_profile_id?: string | null;
  strictly_follow_profile_id?: string | null;
  jnj_lead_profile_id?: string | null;
  jnj_follow_profile_id?: string | null;
}

export interface ResolvedCompSignupFields {
  registrant_profile_id: string;
  strictly_lead_profile_id: string | null;
  strictly_follow_profile_id: string | null;
  jnj_lead_profile_id: string | null;
  jnj_follow_profile_id: string | null;
  strictly_lead_first_name: string | null;
  strictly_lead_last_name: string | null;
  strictly_lead_email: string | null;
  strictly_follow_first_name: string | null;
  strictly_follow_last_name: string | null;
  strictly_follow_email: string | null;
  jnj_lead_first_name: string | null;
  jnj_lead_last_name: string | null;
  jnj_lead_email: string | null;
  jnj_follow_first_name: string | null;
  jnj_follow_last_name: string | null;
  jnj_follow_email: string | null;
}

function isRole(v: unknown): v is DanceRole {
  return v === "lead" || v === "follow";
}

function profileFields(p: CompSignupProfile | null) {
  if (!p) {
    return {
      first_name: null as string | null,
      last_name: null as string | null,
      email: null as string | null,
    };
  }
  return {
    first_name: p.first_name?.trim() || null,
    last_name: p.last_name?.trim() || null,
    email: p.email?.trim().toLowerCase() || null,
  };
}

async function loadProfile(id: string): Promise<CompSignupProfile | null> {
  const { data } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", id)
    .maybeSingle();
  return (data as CompSignupProfile | null) ?? null;
}

/**
 * Validates profile IDs for a comp signup and resolves denormalized name/email
 * fields from the database (ignoring any client-supplied text).
 */
export async function resolveCompSignupProfiles(
  authProfile: CompSignupProfile,
  data: CompSignupRequestBody,
  opts: { strictlySelected: boolean; jnjSelected: boolean }
): Promise<{ error: string; status: number } | ResolvedCompSignupFields> {
  const registrantId = data.registrant_profile_id;
  if (!registrantId || registrantId !== authProfile.id) {
    return { error: "Invalid registrant profile", status: 403 };
  }

  let strictlyLeadId: string | null = null;
  let strictlyFollowId: string | null = null;
  let jnjLeadId: string | null = null;
  let jnjFollowId: string | null = null;

  if (opts.strictlySelected) {
    const role = data.strictly_role;
    if (!isRole(role)) {
      return { error: "Strictly: select whether you are Lead or Follow", status: 400 };
    }
    const partnerId =
      role === "lead"
        ? data.strictly_follow_profile_id
        : data.strictly_lead_profile_id;
    if (!partnerId || typeof partnerId !== "string") {
      return {
        error: "Strictly: select your partner from the profile search",
        status: 400,
      };
    }
    if (partnerId === registrantId) {
      return { error: "Strictly: partner cannot be yourself", status: 400 };
    }
    const partner = await loadProfile(partnerId);
    if (!partner) {
      return { error: "Strictly: partner profile not found", status: 400 };
    }
    if (role === "lead") {
      strictlyLeadId = registrantId;
      strictlyFollowId = partnerId;
    } else {
      strictlyFollowId = registrantId;
      strictlyLeadId = partnerId;
    }
  }

  if (opts.jnjSelected) {
    const role = data.jnj_role;
    if (!isRole(role)) {
      return { error: "JnJ: select whether you are Lead or Follow", status: 400 };
    }
    if (role === "lead") {
      jnjLeadId = registrantId;
    } else {
      jnjFollowId = registrantId;
    }
  }

  const profileIds = [
    strictlyLeadId,
    strictlyFollowId,
    jnjLeadId,
    jnjFollowId,
  ].filter(Boolean) as string[];
  const uniqueIds = [...new Set(profileIds)];
  const profiles = new Map<string, CompSignupProfile>();
  profiles.set(authProfile.id, authProfile);

  for (const id of uniqueIds) {
    if (profiles.has(id)) continue;
    const p = await loadProfile(id);
    if (!p) {
      return { error: "One or more profile IDs are invalid", status: 400 };
    }
    profiles.set(id, p);
  }

  const sl = profileFields(strictlyLeadId ? profiles.get(strictlyLeadId)! : null);
  const sf = profileFields(
    strictlyFollowId ? profiles.get(strictlyFollowId)! : null
  );
  const jl = profileFields(jnjLeadId ? profiles.get(jnjLeadId)! : null);
  const jf = profileFields(jnjFollowId ? profiles.get(jnjFollowId)! : null);

  return {
    registrant_profile_id: registrantId,
    strictly_lead_profile_id: strictlyLeadId,
    strictly_follow_profile_id: strictlyFollowId,
    jnj_lead_profile_id: jnjLeadId,
    jnj_follow_profile_id: jnjFollowId,
    strictly_lead_first_name: sl.first_name,
    strictly_lead_last_name: sl.last_name,
    strictly_lead_email: sl.email,
    strictly_follow_first_name: sf.first_name,
    strictly_follow_last_name: sf.last_name,
    strictly_follow_email: sf.email,
    jnj_lead_first_name: jl.first_name,
    jnj_lead_last_name: jl.last_name,
    jnj_lead_email: jl.email,
    jnj_follow_first_name: jf.first_name,
    jnj_follow_last_name: jf.last_name,
    jnj_follow_email: jf.email,
  };
}

export async function checkDuplicateCompSignup(
  eventId: string,
  resolved: ResolvedCompSignupFields,
  opts: { strictlySelected: boolean; jnjSelected: boolean }
): Promise<boolean> {
  const { data: existingSignups } = await supabaseServer
    .from("comp_signups")
    .select(
      "strictly_selected, strictly_lead_email, strictly_follow_email, strictly_lead_profile_id, strictly_follow_profile_id, jnj_selected, jnj_lead_email, jnj_follow_email, jnj_lead_profile_id, jnj_follow_profile_id"
    )
    .eq("event_id", eventId)
    .neq("refunded_or_cancelled", "cancelled");

  const norm = (e: unknown) =>
    typeof e === "string" && e.trim() !== "" ? e.trim().toLowerCase() : null;

  const existingStrictlyEmails = new Set<string>();
  const existingJnJEmails = new Set<string>();
  const existingStrictlyProfiles = new Set<string>();
  const existingJnJProfiles = new Set<string>();

  for (const row of existingSignups ?? []) {
    const r = row as Record<string, string | null | boolean>;
    if (r.strictly_selected) {
      for (const e of [norm(r.strictly_lead_email), norm(r.strictly_follow_email)]) {
        if (e) existingStrictlyEmails.add(e);
      }
      for (const id of [r.strictly_lead_profile_id, r.strictly_follow_profile_id]) {
        if (typeof id === "string" && id) existingStrictlyProfiles.add(id);
      }
    }
    if (r.jnj_selected) {
      for (const e of [norm(r.jnj_lead_email), norm(r.jnj_follow_email)]) {
        if (e) existingJnJEmails.add(e);
      }
      for (const id of [r.jnj_lead_profile_id, r.jnj_follow_profile_id]) {
        if (typeof id === "string" && id) existingJnJProfiles.add(id);
      }
    }
  }

  const registrantId = resolved.registrant_profile_id;
  const strictlyProfileIds = [
    resolved.strictly_lead_profile_id,
    resolved.strictly_follow_profile_id,
  ].filter(Boolean) as string[];
  const jnjProfileIds = [
    resolved.jnj_lead_profile_id,
    resolved.jnj_follow_profile_id,
  ].filter(Boolean) as string[];

  if (opts.strictlySelected) {
    const dupEmail = [
      norm(resolved.strictly_lead_email),
      norm(resolved.strictly_follow_email),
    ]
      .filter(Boolean)
      .some((e) => existingStrictlyEmails.has(e!));
    const dupProfile =
      strictlyProfileIds.some((id) => existingStrictlyProfiles.has(id)) ||
      existingStrictlyProfiles.has(registrantId);
    if (dupEmail || dupProfile) return true;
  }

  if (opts.jnjSelected) {
    const dupEmail = [
      norm(resolved.jnj_lead_email),
      norm(resolved.jnj_follow_email),
    ]
      .filter(Boolean)
      .some((e) => existingJnJEmails.has(e!));
    const dupProfile =
      jnjProfileIds.some((id) => existingJnJProfiles.has(id)) ||
      existingJnJProfiles.has(registrantId);
    if (dupEmail || dupProfile) return true;
  }

  return false;
}
