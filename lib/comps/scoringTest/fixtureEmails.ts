/** Synthetic competitor emails for mock competitions (walk-up entries, no auth). */

export const FIXTURE_EMAIL_DOMAIN = "@ccs.test";
export const FIXTURE_EMAIL_PREFIX = "test-fixture-";

export function padFixtureIndex(index: number): string {
  return String(index).padStart(2, "0");
}

export function fixtureStrictlyLeadEmail(index: number): string {
  return `${FIXTURE_EMAIL_PREFIX}strictly-lead-${padFixtureIndex(index)}${FIXTURE_EMAIL_DOMAIN}`;
}

export function fixtureStrictlyFollowEmail(index: number): string {
  return `${FIXTURE_EMAIL_PREFIX}strictly-follow-${padFixtureIndex(index)}${FIXTURE_EMAIL_DOMAIN}`;
}

export function fixtureJnJLeadEmail(index: number): string {
  return `${FIXTURE_EMAIL_PREFIX}jnj-lead-${padFixtureIndex(index)}${FIXTURE_EMAIL_DOMAIN}`;
}

export function fixtureJnJFollowEmail(index: number): string {
  return `${FIXTURE_EMAIL_PREFIX}jnj-follow-${padFixtureIndex(index)}${FIXTURE_EMAIL_DOMAIN}`;
}

export function isFixtureEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().startsWith(FIXTURE_EMAIL_PREFIX);
}

/** Bib numbers are unique per event — offset pools so Strictly + JnJ can share one sandbox event. */
export type FixtureBibPool = "strictly_lead" | "jnj_lead" | "jnj_follow";

const BIB_POOL_OFFSET: Record<FixtureBibPool, number> = {
  strictly_lead: 0,
  jnj_lead: 30,
  jnj_follow: 60,
};

export function fixtureBibNumber(pool: FixtureBibPool, index: number): number {
  return BIB_POOL_OFFSET[pool] + index;
}
