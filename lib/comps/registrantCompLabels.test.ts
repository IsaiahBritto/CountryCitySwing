import { describe, expect, it } from "vitest";
import {
  collectEventRegistrants,
  personKeyFromFields,
} from "@/lib/comps/eventRegistrants";
import {
  buildCompetingInFromEntries,
  enrichRosterCompetingIn,
  formatCompetitionRoleLabel,
  formatSignupCompetingIn,
  type CompetitionMeta,
  type EventEntryRow,
} from "@/lib/comps/registrantCompLabels";

const newcomerJnJ: CompetitionMeta = {
  id: "c-jnj-new",
  name: "Newcomer (JnJ)",
  comp_type: "jack_and_jill",
};

const allLevelJnJ: CompetitionMeta = {
  id: "c-jnj-all",
  name: "All-level (JnJ)",
  comp_type: "jack_and_jill",
};

const allLevelStrictly: CompetitionMeta = {
  id: "c-strict",
  name: "All-Level (Strictly)",
  comp_type: "strictly",
};

const allComps = [newcomerJnJ, allLevelJnJ, allLevelStrictly];

describe("formatCompetitionRoleLabel", () => {
  it("includes competition name, type, and role", () => {
    expect(formatCompetitionRoleLabel(newcomerJnJ, ["Lead"])).toBe(
      "Newcomer (JnJ) Jack & Jill (Lead)"
    );
  });
});

describe("formatSignupCompetingIn", () => {
  it("uses generic type + role before import when division not stored", () => {
    expect(
      formatSignupCompetingIn({ roles: ["jnj_follow"] }, allComps)
    ).toEqual(["Jack & Jill (Follow)"]);
    expect(
      formatSignupCompetingIn(
        { roles: ["jnj_lead", "strictly_lead"] },
        allComps
      )
    ).toEqual(["Jack & Jill (Lead)", "Strictly (Lead)"]);
  });

  it("uses competition name when division id is on signup", () => {
    expect(
      formatSignupCompetingIn(
        {
          roles: ["jnj_follow"],
          signupDivisionIds: { jnjCompetitionId: "c-jnj-new" },
        },
        allComps
      )
    ).toEqual(["Newcomer (JnJ) Jack & Jill (Follow)"]);
  });
});

describe("buildCompetingInFromEntries", () => {
  it("uses only divisions the person is entered in", () => {
    const personKey = personKeyFromFields(
      null,
      "walk@example.com",
      "Walk",
      "Up"
    );
    const entries: EventEntryRow[] = [
      {
        id: "e1",
        competition_id: "c-jnj-new",
        entry_kind: "individual",
        role: "lead",
        lead_first_name: "Walk",
        lead_last_name: "Up",
        lead_email: "walk@example.com",
        lead_profile_id: null,
        follow_first_name: "",
        follow_last_name: "",
        follow_email: null,
        follow_profile_id: null,
      },
    ];
    expect(
      buildCompetingInFromEntries(personKey, entries, allComps)
    ).toEqual(["Newcomer (JnJ) Jack & Jill (Lead)"]);
  });

  it("does not merge multiple divisions into one line", () => {
    const personKey = personKeyFromFields(
      null,
      "alex@example.com",
      "Alex",
      "Dancer"
    );
    const entries: EventEntryRow[] = [
      {
        id: "e1",
        competition_id: "c-jnj-new",
        entry_kind: "individual",
        role: "lead",
        lead_first_name: "Alex",
        lead_last_name: "Dancer",
        lead_email: "alex@example.com",
        lead_profile_id: null,
        follow_first_name: "",
        follow_last_name: "",
        follow_email: null,
        follow_profile_id: null,
      },
      {
        id: "e2",
        competition_id: "c-jnj-all",
        entry_kind: "individual",
        role: "lead",
        lead_first_name: "Alex",
        lead_last_name: "Dancer",
        lead_email: "alex@example.com",
        lead_profile_id: null,
        follow_first_name: "",
        follow_last_name: "",
        follow_email: null,
        follow_profile_id: null,
      },
    ];
    expect(buildCompetingInFromEntries(personKey, entries, allComps)).toEqual([
      "All-level (JnJ) Jack & Jill (Lead)",
      "Newcomer (JnJ) Jack & Jill (Lead)",
    ]);
  });

  it("ignores drawn follow rows with source_lead_entry_id", () => {
    const personKey = personKeyFromFields(
      null,
      "sam@example.com",
      "Sam",
      "Follow"
    );
    const entries: EventEntryRow[] = [
      {
        id: "e1",
        competition_id: "c-jnj-new",
        entry_kind: "individual",
        role: "follow",
        lead_first_name: "",
        lead_last_name: "",
        lead_email: null,
        lead_profile_id: null,
        follow_first_name: "Sam",
        follow_last_name: "Follow",
        follow_email: "sam@example.com",
        follow_profile_id: null,
      },
      {
        id: "e2",
        competition_id: "c-jnj-new",
        entry_kind: "couple",
        role: null,
        source_lead_entry_id: "lead-1",
        lead_first_name: "Lead",
        lead_last_name: "One",
        lead_email: "lead@example.com",
        lead_profile_id: null,
        follow_first_name: "Sam",
        follow_last_name: "Follow",
        follow_email: "sam@example.com",
        follow_profile_id: null,
      },
    ];
    expect(buildCompetingInFromEntries(personKey, entries, allComps)).toEqual([
      "Newcomer (JnJ) Jack & Jill (Follow)",
    ]);
  });
});

describe("enrichRosterCompetingIn", () => {
  it("uses signup division names when no entries", () => {
    const roster = collectEventRegistrants(
      [
        {
          id: "s1",
          event_id: "e1",
          event_title: "GAC",
          registrant_profile_id: null,
          jnj_selected: true,
          jnj_follow_first_name: "Amy",
          jnj_follow_last_name: "Bailey",
          jnj_follow_email: "amy@example.com",
          paid: false,
        } as import("@/lib/comps/types").CompSignupRow,
      ],
      []
    );
    const enriched = enrichRosterCompetingIn(roster, [], allComps);
    expect(enriched[0].competingIn).toEqual(["Jack & Jill (Follow)"]);
  });
});
