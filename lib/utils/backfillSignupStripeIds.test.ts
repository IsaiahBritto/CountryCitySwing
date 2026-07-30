import { describe, expect, it } from "vitest";
import {
  matchSessionsToSignups,
  type BackfillSessionInfo,
  type BackfillSignupCandidate,
} from "@/lib/utils/backfillSignupStripeIds";

const baseSession = (
  overrides: Partial<BackfillSessionInfo> & Pick<BackfillSessionInfo, "id">
): BackfillSessionInfo => ({
  payment_intent_id: "pi_1",
  created: 1_700_000_000,
  payment_type: "stripe_checkout",
  signup_id: null,
  comp_signup_id: null,
  client_reference_id: null,
  email: "a@example.com",
  event_id: "evt-1",
  ...overrides,
});

const baseCandidate = (
  overrides: Partial<BackfillSignupCandidate> & Pick<BackfillSignupCandidate, "id">
): BackfillSignupCandidate => ({
  event_id: "evt-1",
  email: "a@example.com",
  created_at: new Date(1_700_000_000 * 1000).toISOString(),
  is_comp: false,
  ...overrides,
});

describe("matchSessionsToSignups", () => {
  it("Tier1 matches cash_to_stripe by signup_id", () => {
    const results = matchSessionsToSignups(
      [
        baseSession({
          id: "cs_1",
          payment_type: "cash_to_stripe",
          signup_id: "42",
          client_reference_id: "42",
        }),
      ],
      [baseCandidate({ id: "42" })]
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "tier1",
      signupId: "42",
      sessionId: "cs_1",
    });
  });

  it("Tier2 matches stripe_checkout by email+event+time", () => {
    const results = matchSessionsToSignups(
      [
        baseSession({
          id: "cs_2",
          signup_id: "throwaway-uuid",
          client_reference_id: "throwaway-uuid",
        }),
      ],
      [baseCandidate({ id: "99" })]
    );
    expect(results[0]).toMatchObject({
      kind: "tier2",
      signupId: "99",
      sessionId: "cs_2",
    });
  });

  it("marks ambiguous when two candidates have close deltas", () => {
    const t = 1_700_000_000 * 1000;
    const results = matchSessionsToSignups(
      [baseSession({ id: "cs_3", signup_id: "x" })],
      [
        baseCandidate({ id: "1", created_at: new Date(t).toISOString() }),
        baseCandidate({
          id: "2",
          created_at: new Date(t + 60_000).toISOString(),
        }),
      ]
    );
    expect(results[0]?.kind).toBe("ambiguous");
  });

  it("unmatched when outside time window", () => {
    const t = 1_700_000_000 * 1000;
    const results = matchSessionsToSignups(
      [baseSession({ id: "cs_4", signup_id: "x" })],
      [
        baseCandidate({
          id: "1",
          created_at: new Date(t + 3 * 60 * 60 * 1000).toISOString(),
        }),
      ]
    );
    expect(results[0]).toMatchObject({
      kind: "unmatched",
      reason: "no_email_event_time_match",
    });
  });
});
