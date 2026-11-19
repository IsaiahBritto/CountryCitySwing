import {
  collectEventRegistrants,
  type EventRegistrantPerson,
} from "@/lib/comps/eventRegistrants";
import {
  FIXTURE_EMAIL_DOMAIN,
  isFixtureEmail,
} from "@/lib/comps/scoringTest/fixtureEmails";
import type { CompSignupRow } from "@/lib/comps/types";

export function isTestRegistrantEmail(
  email: string | null | undefined
): boolean {
  if (!email?.trim()) return false;
  const e = email.trim().toLowerCase();
  return isFixtureEmail(e) || e.endsWith(FIXTURE_EMAIL_DOMAIN);
}

export function isTestRosterPerson(
  person: Pick<EventRegistrantPerson, "profileId" | "email" | "firstName" | "lastName">
): boolean {
  if (person.profileId?.trim()) return false;
  const email = person.email?.trim();
  if (email) return isTestRegistrantEmail(email);
  const hasName = !!(person.firstName?.trim() || person.lastName?.trim());
  return !hasName;
}

function signupIdentityEmails(signup: CompSignupRow): string[] {
  const emails: string[] = [];
  const push = (e: string | null | undefined) => {
    if (e?.trim()) emails.push(e.trim().toLowerCase());
  };
  if (signup.registrant_profile_id?.trim()) return [];
  if (signup.strictly_lead_profile_id?.trim()) return [];
  if (signup.strictly_follow_profile_id?.trim()) return [];
  if (signup.jnj_lead_profile_id?.trim()) return [];
  if (signup.jnj_follow_profile_id?.trim()) return [];

  push(signup.strictly_lead_email);
  push(signup.strictly_follow_email);
  push(signup.jnj_lead_email);
  push(signup.jnj_follow_email);
  return emails;
}

export function isTestCompSignup(signup: CompSignupRow): boolean {
  if (signup.registrant_profile_id?.trim()) return false;
  if (signup.strictly_lead_profile_id?.trim()) return false;
  if (signup.strictly_follow_profile_id?.trim()) return false;
  if (signup.jnj_lead_profile_id?.trim()) return false;
  if (signup.jnj_follow_profile_id?.trim()) return false;

  const emails = signupIdentityEmails(signup);
  if (emails.length === 0) return false;
  return emails.every(isTestRegistrantEmail);
}

export function eventHasNonTestRegistrants(
  signups: CompSignupRow[],
  bibs: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    profile_id: string | null;
    bib_number: number | null;
  }[]
): boolean {
  const roster = collectEventRegistrants(signups, bibs);
  if (roster.length === 0) return false;
  return roster.some((p) => !isTestRosterPerson(p));
}