import { describe, expect, it } from "vitest";
import {
  collectEventRegistrants,
  isEventJudge,
  needsEventBib,
  personKeyFromFields,
  validateBibNumberAssignments,
} from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";

describe("validateBibNumberAssignments", () => {
  it("rejects non-positive and duplicate numbers", () => {
    expect(
      validateBibNumberAssignments([
        { bibId: "a", bibNumber: 101 },
        { bibId: "b", bibNumber: 101 },
      ])
    ).toMatch(/Duplicate/);

    expect(
      validateBibNumberAssignments([{ bibId: "a", bibNumber: 0 }])
    ).toMatch(/positive integer/);
  });

  it("accepts unique positive integers", () => {
    expect(
      validateBibNumberAssignments([
        { bibId: "a", bibNumber: 101 },
        { bibId: "b", bibNumber: 102 },
      ])
    ).toBeNull();
  });
});

describe("personKeyFromFields", () => {
  it("prefers profile id, then email, then name", () => {
    expect(
      personKeyFromFields("p1", "a@b.com", "Ann", "Lee")
    ).toBe("profile:p1");
    expect(personKeyFromFields(null, "a@b.com", "Ann", "Lee")).toBe(
      "email:a@b.com"
    );
    expect(personKeyFromFields(null, null, "Ann", "Lee")).toBe("name:ann|lee");
  });
});

describe("collectEventRegistrants", () => {
  const baseSignup: CompSignupRow = {
    id: "s1",
    event_id: "e1",
    event_title: "Test",
    registrant_profile_id: "reg1",
    strictly_selected: true,
    strictly_lead_profile_id: "sl1",
    strictly_lead_first_name: "Sam",
    strictly_lead_last_name: "Lead",
    strictly_lead_email: "sam@example.com",
    strictly_follow_profile_id: "sf1",
    strictly_follow_first_name: "Fran",
    strictly_follow_last_name: "Follow",
    strictly_follow_email: "fran@example.com",
    jnj_selected: true,
    jnj_lead_profile_id: "sl1",
    jnj_lead_first_name: "Sam",
    jnj_lead_last_name: "Lead",
    jnj_lead_email: "sam@example.com",
    jnj_follow_profile_id: "jf1",
    jnj_follow_first_name: "Jill",
    jnj_follow_last_name: "Follow",
    jnj_follow_email: "jill@example.com",
    paid: true,
  };

  it("dedupes the same person across JnJ and Strictly", () => {
    const roster = collectEventRegistrants([baseSignup], []);
    const sam = roster.find((r) => r.profileId === "sl1");
    expect(sam).toBeDefined();
    expect(sam!.roles).toEqual(
      expect.arrayContaining(["jnj_lead", "strictly_lead"])
    );
    expect(roster.find((r) => r.profileId === "sf1")).toBeUndefined();
    expect(roster).toHaveLength(2);
  });

  it("sorts by first name", () => {
    const roster = collectEventRegistrants([baseSignup], []);
    expect(roster.map((r) => r.firstName)).toEqual(["Jill", "Sam"]);
  });

  it("excludes event judges", () => {
    const roster = collectEventRegistrants([baseSignup], [], {
      judges: [{ profileId: "jf1", email: null }],
    });
    expect(roster.find((r) => r.profileId === "jf1")).toBeUndefined();
    expect(roster).toHaveLength(1);
  });

  it("merges existing bib rows including walk-ups", () => {
    const roster = collectEventRegistrants([], [
      {
        id: "b1",
        first_name: "Walk",
        last_name: "Up",
        email: "walk@example.com",
        profile_id: null,
        bib_number: 150,
      },
    ]);
    expect(roster).toHaveLength(1);
    expect(roster[0].bibId).toBe("b1");
    expect(roster[0].bibNumber).toBe(150);
    expect(roster[0].roles).toEqual([]);
  });
});

describe("needsEventBib", () => {
  it("is false for Strictly-only follows", () => {
    expect(needsEventBib(["strictly_follow"])).toBe(false);
    expect(needsEventBib(["strictly_follow", "jnj_follow"])).toBe(true);
  });
});

describe("isEventJudge", () => {
  it("matches profile id or email", () => {
    expect(
      isEventJudge(
        { profileId: "j1", email: "j@example.com" },
        [{ profileId: "j1", email: null }]
      )
    ).toBe(true);
    expect(
      isEventJudge(
        { profileId: null, email: "j@example.com" },
        [{ profileId: null, email: "j@example.com" }]
      )
    ).toBe(true);
  });
});
