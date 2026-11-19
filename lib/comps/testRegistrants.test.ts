import { describe, it, expect } from "vitest";
import {
  eventHasNonTestRegistrants,
  isTestCompSignup,
  isTestRegistrantEmail,
  isTestRosterPerson,
} from "@/lib/comps/testRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";

function baseSignup(): CompSignupRow {
  return {
    id: "s1",
    event_id: "e1",
    event_title: "T",
    registrant_profile_id: null,
    strictly_selected: false,
    strictly_lead_profile_id: null,
    strictly_follow_profile_id: null,
    strictly_lead_first_name: null,
    strictly_lead_last_name: null,
    strictly_lead_email: null,
    strictly_follow_first_name: null,
    strictly_follow_last_name: null,
    strictly_follow_email: null,
    jnj_selected: true,
    jnj_lead_profile_id: null,
    jnj_follow_profile_id: null,
    jnj_lead_first_name: "Test",
    jnj_lead_last_name: "Lead",
    jnj_lead_email: "test-fixture-jnj-lead-01@ccs.test",
    jnj_follow_first_name: null,
    jnj_follow_last_name: null,
    jnj_follow_email: null,
    paid: false,
  };
}

describe("isTestRegistrantEmail", () => {
  it("accepts fixture and ccs.test sandbox emails", () => {
    expect(isTestRegistrantEmail("test-fixture-jnj-lead-01@ccs.test")).toBe(true);
    expect(isTestRegistrantEmail("other@ccs.test")).toBe(true);
    expect(isTestRegistrantEmail("real@example.com")).toBe(false);
  });
});

describe("isTestCompSignup", () => {
  it("treats fixture-only guest signup as test", () => {
    expect(isTestCompSignup(baseSignup())).toBe(true);
  });

  it("rejects signups tied to real profiles", () => {
    expect(isTestCompSignup({ ...baseSignup(), registrant_profile_id: "p1" })).toBe(
      false
    );
  });

  it("rejects guest signup with a real email", () => {
    expect(
      isTestCompSignup({
        ...baseSignup(),
        jnj_lead_email: "dancer@example.com",
      })
    ).toBe(false);
  });
});

describe("eventHasNonTestRegistrants", () => {
  it("returns false when roster is empty", () => {
    expect(eventHasNonTestRegistrants([], [])).toBe(false);
  });

  it("returns false when all roster rows are test", () => {
    const signup = baseSignup();
    expect(eventHasNonTestRegistrants([signup], [])).toBe(false);
  });

  it("returns false when signups are gone but orphan bibs remain", () => {
    expect(
      eventHasNonTestRegistrants([], [
        {
          id: "b1",
          first_name: "Alex",
          last_name: "Dancer",
          email: "alex@example.com",
          profile_id: null,
          bib_number: 1,
        },
      ])
    ).toBe(false);
  });

  it("returns true when a real email is on the roster", () => {
    const signup: CompSignupRow = {
      ...baseSignup(),
      jnj_lead_email: "real@example.com",
    };
    expect(eventHasNonTestRegistrants([signup], [])).toBe(true);
  });
});

describe("isTestRosterPerson", () => {
  it("treats profile-linked people as non-test", () => {
    expect(
      isTestRosterPerson({
        profileId: "p1",
        email: "test-fixture-jnj-lead-01@ccs.test",
        firstName: "A",
        lastName: "B",
      })
    ).toBe(false);
  });
});