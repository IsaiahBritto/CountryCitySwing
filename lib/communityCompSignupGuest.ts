import type { ResolvedCompSignupFields } from "@/lib/compSignupPayload";

type DanceRole = "lead" | "follow";

export type GuestPersonInput = {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
};

export type GuestCommunityCompSignupBody = {
  strictly_selected?: boolean;
  jnj_selected?: boolean;
  strictly_role?: unknown;
  jnj_role?: unknown;
  registrant?: GuestPersonInput;
  strictly_partner?: GuestPersonInput;
};

export type GuestResolvedCompSignupFields = Omit<
  ResolvedCompSignupFields,
  "registrant_profile_id"
> & {
  registrant_profile_id: null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeCompSignupEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const e = value.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

function isRole(v: unknown): v is DanceRole {
  return v === "lead" || v === "follow";
}

function parsePerson(
  raw: GuestPersonInput | undefined,
  label: string
): { error: string; status: number } | { first: string; last: string; email: string } {
  if (!raw || typeof raw !== "object") {
    return { error: `${label}: name and email are required`, status: 400 };
  }
  const first =
    typeof raw.first_name === "string" ? raw.first_name.trim() : "";
  const last = typeof raw.last_name === "string" ? raw.last_name.trim() : "";
  const email = normalizeCompSignupEmail(raw.email);
  if (!first || !last) {
    return { error: `${label}: first and last name are required`, status: 400 };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { error: `${label}: a valid email is required`, status: 400 };
  }
  return { first, last, email };
}

export function resolveGuestCommunityCompSignup(
  data: GuestCommunityCompSignupBody,
  opts: { strictlySelected: boolean; jnjSelected: boolean }
): { error: string; status: number } | GuestResolvedCompSignupFields {
  const registrant = parsePerson(data.registrant, "Registrant");
  if ("error" in registrant) return registrant;

  let strictlyLead = { first: null as string | null, last: null as string | null, email: null as string | null };
  let strictlyFollow = { first: null as string | null, last: null as string | null, email: null as string | null };
  let jnjLead = { first: null as string | null, last: null as string | null, email: null as string | null };
  let jnjFollow = { first: null as string | null, last: null as string | null, email: null as string | null };

  if (opts.strictlySelected) {
    const role = data.strictly_role;
    if (!isRole(role)) {
      return { error: "Strictly: select whether you are Lead or Follow", status: 400 };
    }
    const partner = parsePerson(data.strictly_partner, "Strictly partner");
    if ("error" in partner) return partner;
    if (partner.email === registrant.email) {
      return { error: "Strictly: partner email cannot match your email", status: 400 };
    }
    if (role === "lead") {
      strictlyLead = { first: registrant.first, last: registrant.last, email: registrant.email };
      strictlyFollow = {
        first: partner.first,
        last: partner.last,
        email: partner.email,
      };
    } else {
      strictlyFollow = {
        first: registrant.first,
        last: registrant.last,
        email: registrant.email,
      };
      strictlyLead = {
        first: partner.first,
        last: partner.last,
        email: partner.email,
      };
    }
  }

  if (opts.jnjSelected) {
    const role = data.jnj_role;
    if (!isRole(role)) {
      return { error: "JnJ: select whether you are Lead or Follow", status: 400 };
    }
    if (role === "lead") {
      jnjLead = { first: registrant.first, last: registrant.last, email: registrant.email };
    } else {
      jnjFollow = {
        first: registrant.first,
        last: registrant.last,
        email: registrant.email,
      };
    }
  }

  return {
    registrant_profile_id: null,
    strictly_lead_profile_id: null,
    strictly_follow_profile_id: null,
    jnj_lead_profile_id: null,
    jnj_follow_profile_id: null,
    strictly_lead_first_name: strictlyLead.first,
    strictly_lead_last_name: strictlyLead.last,
    strictly_lead_email: strictlyLead.email,
    strictly_follow_first_name: strictlyFollow.first,
    strictly_follow_last_name: strictlyFollow.last,
    strictly_follow_email: strictlyFollow.email,
    jnj_lead_first_name: jnjLead.first,
    jnj_lead_last_name: jnjLead.last,
    jnj_lead_email: jnjLead.email,
    jnj_follow_first_name: jnjFollow.first,
    jnj_follow_last_name: jnjFollow.last,
    jnj_follow_email: jnjFollow.email,
  };
}

export type ExistingSignupEmailRow = {
  strictly_selected?: boolean | null;
  strictly_lead_email?: string | null;
  strictly_follow_email?: string | null;
  jnj_selected?: boolean | null;
  jnj_lead_email?: string | null;
  jnj_follow_email?: string | null;
};

/** Pure duplicate check for tests and API (email only, case-insensitive). */
export function checkDuplicateCommunityCompSignupByEmailFromRows(
  existingRows: ExistingSignupEmailRow[],
  resolved: GuestResolvedCompSignupFields,
  opts: { strictlySelected: boolean; jnjSelected: boolean }
): boolean {
  const norm = normalizeCompSignupEmail;

  const existingStrictlyEmails = new Set<string>();
  const existingJnJEmails = new Set<string>();

  for (const row of existingRows) {
    if (row.strictly_selected) {
      for (const e of [norm(row.strictly_lead_email), norm(row.strictly_follow_email)]) {
        if (e) existingStrictlyEmails.add(e);
      }
    }
    if (row.jnj_selected) {
      for (const e of [norm(row.jnj_lead_email), norm(row.jnj_follow_email)]) {
        if (e) existingJnJEmails.add(e);
      }
    }
  }

  if (opts.strictlySelected) {
    const incoming = [norm(resolved.strictly_lead_email), norm(resolved.strictly_follow_email)].filter(
      Boolean
    ) as string[];
    if (incoming.some((e) => existingStrictlyEmails.has(e))) return true;
  }

  if (opts.jnjSelected) {
    const incoming = [norm(resolved.jnj_lead_email), norm(resolved.jnj_follow_email)].filter(
      Boolean
    ) as string[];
    if (incoming.some((e) => existingJnJEmails.has(e))) return true;
  }

  return false;
}
