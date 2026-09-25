import { describe, expect, it } from "vitest";
import {
  FIXTURE_STRICTLY_COUPLES,
  FIXTURE_JNJ_PER_ROLE,
} from "./constants";
import {
  fixtureBibNumber,
  fixtureJnJFollowEmail,
  fixtureJnJLeadEmail,
  fixtureStrictlyFollowEmail,
  fixtureStrictlyLeadEmail,
  isFixtureEmail,
  padFixtureIndex,
} from "./fixtureEmails";

describe("fixtureEmails", () => {
  it("pads indices to two digits", () => {
    expect(padFixtureIndex(1)).toBe("01");
    expect(padFixtureIndex(30)).toBe("30");
  });

  it("builds stable synthetic emails", () => {
    expect(fixtureStrictlyLeadEmail(1)).toBe(
      "test-fixture-strictly-lead-01@ccs.test"
    );
    expect(fixtureJnJFollowEmail(30)).toBe(
      "test-fixture-jnj-follow-30@ccs.test"
    );
    expect(fixtureStrictlyFollowEmail(5)).toBe(
      "test-fixture-strictly-follow-05@ccs.test"
    );
    expect(fixtureJnJLeadEmail(12)).toBe("test-fixture-jnj-lead-12@ccs.test");
  });

  it("detects fixture emails", () => {
    expect(isFixtureEmail("test-fixture-jnj-lead-01@ccs.test")).toBe(true);
    expect(isFixtureEmail("real@example.com")).toBe(false);
    expect(isFixtureEmail(null)).toBe(false);
  });

  it("assigns non-overlapping bib pools on one event", () => {
    const strictMax = fixtureBibNumber("strictly_lead", FIXTURE_STRICTLY_COUPLES);
    const jnjLeadMin = fixtureBibNumber("jnj_lead", 1);
    const jnjFollowMin = fixtureBibNumber("jnj_follow", 1);
    const jnjFollowMax = fixtureBibNumber("jnj_follow", FIXTURE_JNJ_PER_ROLE);

    expect(strictMax).toBe(30);
    expect(jnjLeadMin).toBe(31);
    expect(jnjFollowMin).toBe(61);
    expect(jnjFollowMax).toBe(90);
    expect(jnjLeadMin).toBeGreaterThan(strictMax);
    expect(jnjFollowMin).toBeGreaterThan(
      fixtureBibNumber("jnj_lead", FIXTURE_JNJ_PER_ROLE)
    );
  });
});
