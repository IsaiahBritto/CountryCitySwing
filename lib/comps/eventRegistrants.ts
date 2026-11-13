import type { CompSignupRow } from "@/lib/comps/types";

export interface BibAssignment {
  bibId: string;
  bibNumber: number;
}

export interface BibPerson {
  firstName: string;
  lastName: string;
  email?: string | null;
  profileId?: string | null;
}

const normEmail = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

const normName = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

function normalizedFullNameKey(firstName: string, lastName: string): string | null {
  const f = normName(firstName);
  const l = normName(lastName);
  if (!f || !l) return null;
  return `${f}|${l}`;
}

/** Stable dedupe key: profile_id → email → normalized name. */
export function personKeyFromFields(
  profileId: string | null | undefined,
  email: string | null | undefined,
  firstName: string,
  lastName: string
): string {
  if (profileId?.trim()) return `profile:${profileId.trim()}`;
  const e = normEmail(email);
  if (e) return `email:${e}`;
  const name = `${normName(firstName)}|${normName(lastName)}`;
  if (name !== "|") return `name:${name}`;
  return "unknown";
}

function hasPersonFields(person: BibPerson): boolean {
  const first = (person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  const email = normEmail(person.email);
  const profileId = person.profileId?.trim() || "";
  return !!(first || last || email || profileId);
}

export function validateBibNumberAssignments(
  assignments: BibAssignment[]
): string | null {
  const seenNumbers = new Set<number>();
  for (const { bibId, bibNumber } of assignments) {
    if (!bibId) return "Each assignment requires a bib id";
    if (!Number.isInteger(bibNumber) || bibNumber <= 0) {
      return `Bib number must be a positive integer (row ${bibId})`;
    }
    if (seenNumbers.has(bibNumber)) {
      return `Duplicate bib number ${bibNumber}`;
    }
    seenNumbers.add(bibNumber);
  }
  return null;
}

export type EventRegistrantRole =
  | "jnj_lead"
  | "jnj_follow"
  | "strictly_lead"
  | "strictly_follow";

export interface EventRegistrantPerson {
  personKey: string;
  firstName: string;
  lastName: string;
  email: string | null;
  profileId: string | null;
  roles: EventRegistrantRole[];
  bibId: string | null;
  bibNumber: number | null;
  /** Primary comp_signups row for this registrant (if any). */
  compSignupId?: string | null;
  paid?: boolean;
  selectedPaymentMethodLabel?: string | null;
  /** Division names for bib roster; set when roster is enriched from comp_entries. */
  competingIn?: string[];
  signupDivisionIds?: {
    jnjCompetitionId?: string | null;
    strictlyCompetitionId?: string | null;
    allAmericanCompetitionId?: string | null;
  };
}

export interface EventJudgeRef {
  profileId: string | null;
  email: string | null;
}

/** True when this person dances in a division that uses their own bib. */
export function needsEventBib(roles: EventRegistrantRole[]): boolean {
  if (roles.length === 0) return true;
  return roles.some(
    (r) => r === "jnj_lead" || r === "jnj_follow" || r === "strictly_lead"
  );
}

export function isEventJudge(
  person: { profileId: string | null; email: string | null },
  judges: EventJudgeRef[]
): boolean {
  const email = normEmail(person.email) || null;
  for (const judge of judges) {
    if (
      person.profileId &&
      judge.profileId &&
      person.profileId === judge.profileId
    ) {
      return true;
    }
    if (email && judge.email && email === normEmail(judge.email)) {
      return true;
    }
  }
  return false;
}

function findRegistrantRow(
  map: Map<string, EventRegistrantPerson>,
  person: BibPerson
): EventRegistrantPerson | undefined {
  const primaryKey = personKeyFromFields(
    person.profileId,
    person.email,
    person.firstName,
    person.lastName
  );
  const byKey = map.get(primaryKey);
  if (byKey) return byKey;

  const nameKey = normalizedFullNameKey(
    person.firstName ?? "",
    person.lastName ?? ""
  );
  if (!nameKey) return undefined;
  for (const row of map.values()) {
    if (
      normalizedFullNameKey(row.firstName, row.lastName) === nameKey
    ) {
      return row;
    }
  }
  return undefined;
}

function mergePersonFields(row: EventRegistrantPerson, person: BibPerson) {
  if (!row.profileId && person.profileId?.trim()) {
    row.profileId = person.profileId.trim();
  }
  if (!row.email && person.email) {
    row.email = normEmail(person.email) || null;
  }
  const first = (person.firstName ?? "").trim();
  const last = (person.lastName ?? "").trim();
  if (!row.firstName && first) row.firstName = first;
  if (!row.lastName && last) row.lastName = last;
}

function addRegistrant(
  map: Map<string, EventRegistrantPerson>,
  person: BibPerson,
  role: EventRegistrantRole
) {
  if (!hasPersonFields(person)) return;
  const primaryKey = personKeyFromFields(
    person.profileId,
    person.email,
    person.firstName,
    person.lastName
  );
  let row = findRegistrantRow(map, person);
  if (!row) {
    row = {
      personKey: primaryKey,
      firstName: (person.firstName ?? "").trim(),
      lastName: (person.lastName ?? "").trim(),
      email: normEmail(person.email) || null,
      profileId: person.profileId?.trim() || null,
      roles: [],
      bibId: null,
      bibNumber: null,
    };
    map.set(primaryKey, row);
  } else {
    mergePersonFields(row, person);
  }
  if (!row.roles.includes(role)) row.roles.push(role);
}

function attachBib(
  row: EventRegistrantPerson,
  bib: {
    id: string;
    bib_number: number | null;
    profile_id: string | null;
    email: string | null;
    first_name: string;
    last_name: string;
  }
) {
  row.bibId = bib.id;
  row.bibNumber = bib.bib_number;
  if (!row.profileId && bib.profile_id) row.profileId = bib.profile_id;
  if (!row.email && bib.email) row.email = normEmail(bib.email) || null;
  if (!row.firstName && bib.first_name) row.firstName = bib.first_name.trim();
  if (!row.lastName && bib.last_name) row.lastName = bib.last_name.trim();
}

/**
 * Dedupe registrants from signups and merge existing comp_bibs rows (e.g.
 * walk-ups). One row per person per event. Excludes judges and Strictly-only
 * follows (they use the lead's bib on the floor).
 */
export function collectEventRegistrants(
  signups: CompSignupRow[],
  existingBibs: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    profile_id: string | null;
    bib_number: number | null;
  }[],
  options?: { judges?: EventJudgeRef[] }
): EventRegistrantPerson[] {
  const judges = options?.judges ?? [];
  const map = new Map<string, EventRegistrantPerson>();

  for (const s of signups) {
    if (s.all_american_selected) {
      addRegistrant(
        map,
        {
          firstName: s.jnj_lead_first_name ?? "",
          lastName: s.jnj_lead_last_name ?? "",
          email: s.jnj_lead_email,
          profileId: s.jnj_lead_profile_id,
        },
        "jnj_lead"
      );
      addRegistrant(
        map,
        {
          firstName: s.jnj_follow_first_name ?? "",
          lastName: s.jnj_follow_last_name ?? "",
          email: s.jnj_follow_email,
          profileId: s.jnj_follow_profile_id,
        },
        "jnj_follow"
      );
    }
    if (s.jnj_selected) {
      addRegistrant(
        map,
        {
          firstName: s.jnj_lead_first_name ?? "",
          lastName: s.jnj_lead_last_name ?? "",
          email: s.jnj_lead_email,
          profileId: s.jnj_lead_profile_id,
        },
        "jnj_lead"
      );
      addRegistrant(
        map,
        {
          firstName: s.jnj_follow_first_name ?? "",
          lastName: s.jnj_follow_last_name ?? "",
          email: s.jnj_follow_email,
          profileId: s.jnj_follow_profile_id,
        },
        "jnj_follow"
      );
    }
    if (s.strictly_selected) {
      addRegistrant(
        map,
        {
          firstName: s.strictly_lead_first_name ?? "",
          lastName: s.strictly_lead_last_name ?? "",
          email: s.strictly_lead_email,
          profileId: s.strictly_lead_profile_id,
        },
        "strictly_lead"
      );
      addRegistrant(
        map,
        {
          firstName: s.strictly_follow_first_name ?? "",
          lastName: s.strictly_follow_last_name ?? "",
          email: s.strictly_follow_email,
          profileId: s.strictly_follow_profile_id,
        },
        "strictly_follow"
      );
    }
  }

  const attachSignupRow = (s: CompSignupRow) => {
    const meta = {
      compSignupId: s.id,
      paid: !!s.paid,
      selectedPaymentMethodLabel: s.selected_payment_method_label ?? null,
    };
    const tryAttach = (
      profileId: string | null | undefined,
      email: string | null | undefined,
      firstName: string | null | undefined,
      lastName: string | null | undefined
    ) => {
      const row = findRegistrantRow(map, {
        profileId,
        email,
        firstName: firstName ?? "",
        lastName: lastName ?? "",
      });
      if (row) {
        row.compSignupId = meta.compSignupId;
        row.paid = meta.paid;
        row.selectedPaymentMethodLabel = meta.selectedPaymentMethodLabel;
        row.signupDivisionIds = {
          jnjCompetitionId: s.jnj_competition_id ?? null,
          strictlyCompetitionId: s.strictly_competition_id ?? null,
          allAmericanCompetitionId: s.all_american_competition_id ?? null,
        };
      }
    };
    if (s.jnj_selected) {
      tryAttach(
        s.jnj_lead_profile_id,
        s.jnj_lead_email,
        s.jnj_lead_first_name,
        s.jnj_lead_last_name
      );
      tryAttach(
        s.jnj_follow_profile_id,
        s.jnj_follow_email,
        s.jnj_follow_first_name,
        s.jnj_follow_last_name
      );
    }
    if (s.strictly_selected) {
      tryAttach(
        s.strictly_lead_profile_id,
        s.strictly_lead_email,
        s.strictly_lead_first_name,
        s.strictly_lead_last_name
      );
      tryAttach(
        s.strictly_follow_profile_id,
        s.strictly_follow_email,
        s.strictly_follow_first_name,
        s.strictly_follow_last_name
      );
    }
  };

  for (const s of signups) {
    attachSignupRow(s);
  }

  for (const bib of existingBibs) {
    const row = findRegistrantRow(map, {
      profileId: bib.profile_id,
      email: bib.email,
      firstName: bib.first_name,
      lastName: bib.last_name,
    });
    if (row) {
      attachBib(row, bib);
    } else {
      const key = personKeyFromFields(
        bib.profile_id,
        bib.email,
        bib.first_name,
        bib.last_name
      );
      map.set(key, {
        personKey: key,
        firstName: (bib.first_name ?? "").trim(),
        lastName: (bib.last_name ?? "").trim(),
        email: normEmail(bib.email) || null,
        profileId: bib.profile_id,
        roles: [],
        bibId: bib.id,
        bibNumber: bib.bib_number,
      });
    }
  }

  const roleOrder: EventRegistrantRole[] = [
    "jnj_lead",
    "jnj_follow",
    "strictly_lead",
    "strictly_follow",
  ];

  return [...map.values()]
    .map((r) => ({
      ...r,
      roles: [...r.roles].sort(
        (a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)
      ),
    }))
    .filter(
      (r) => needsEventBib(r.roles) && !isEventJudge(r, judges)
    )
    .sort((a, b) => {
      const aFirst = a.firstName.toLowerCase();
      const bFirst = b.firstName.toLowerCase();
      if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
      return a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase());
    });
}

export const ROLE_LABEL: Record<EventRegistrantRole, string> = {
  jnj_lead: "JnJ L",
  jnj_follow: "JnJ F",
  strictly_lead: "Strictly L",
  strictly_follow: "Strictly F",
};

export const COMP_DIVISION_LABEL: Record<EventRegistrantRole, string> = {
  jnj_lead: "Jack & Jill — Lead",
  jnj_follow: "Jack & Jill — Follow",
  strictly_lead: "Strictly — Lead",
  strictly_follow: "Strictly — Follow",
};

/** Human-readable divisions for bib roster (one entry per comp, not per slot). */
export function formatRegistrantCompLabels(
  roles: EventRegistrantRole[]
): string[] {
  if (roles.length === 0) return ["Walk-up"];
  const labels: string[] = [];
  const jnj = roles.filter((r) => r === "jnj_lead" || r === "jnj_follow");
  const strictlyLead = roles.includes("strictly_lead");
  const strictlyFollow = roles.includes("strictly_follow");
  if (jnj.length > 0) {
    const parts = [...new Set(jnj.map((r) => (r === "jnj_lead" ? "Lead" : "Follow")))];
    labels.push(`Jack & Jill (${parts.join(", ")})`);
  }
  if (strictlyLead) {
    labels.push("Strictly (Lead)");
  } else if (strictlyFollow && jnj.length > 0) {
    labels.push("Strictly (Partner)");
  }
  if (labels.length === 0) {
    return roles.map((role) => COMP_DIVISION_LABEL[role]);
  }
  return labels;
}
