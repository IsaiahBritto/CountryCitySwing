export const TEST_STRICTLY_NAME = "Test Strictly";
export const TEST_JNJ_NAME = "Test J&J";

export const MIN_STRICTLY_COUPLES = 3;
export const MIN_JNJ_PER_ROLE = 3;

export const STRICTLY_JUDGE_EMAILS = [
  "test-judge-strictly-1@ccs.test",
  "test-judge-strictly-2@ccs.test",
  "test-judge-strictly-3@ccs.test",
  "test-judge-strictly-4@ccs.test",
  "test-judge-strictly-5@ccs.test",
] as const;

/** Real chief judge for all test comps; fixture accounts fill the panel only. */
export const TEST_COMP_CJ_EMAIL = "isaiah@countrycityswing.dance";

/** Retired fixture CJ — removed when ensuring test judges. */
export const LEGACY_FIXTURE_CJ_EMAIL = "test-cj-strictly@ccs.test";

export const JNJ_JUDGE_SPECS = [
  { email: "test-judge-jnj-1@ccs.test", scope: "lead" as const, dropsFinals: false },
  { email: "test-judge-jnj-2@ccs.test", scope: "lead" as const, dropsFinals: false },
  { email: "test-judge-jnj-3@ccs.test", scope: "follow" as const, dropsFinals: false },
  { email: "test-judge-jnj-4@ccs.test", scope: "follow" as const, dropsFinals: false },
  { email: "test-judge-jnj-5@ccs.test", scope: "both" as const, dropsFinals: false },
  { email: "test-judge-jnj-6@ccs.test", scope: "both" as const, dropsFinals: true },
] as const;
