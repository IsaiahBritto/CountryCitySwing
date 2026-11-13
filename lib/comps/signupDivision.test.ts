import { describe, expect, it } from "vitest";
import {
  divisionSelectionsChanged,
  resolveSignupDivisionIds,
  signupMatchesCompetition,
  targetCompetitionIdForSignup,
} from "@/lib/comps/signupDivision";
import type { CompSignupRow } from "@/lib/comps/types";

const competitions = [
  { id: "jnj-new", name: "Newcomer", comp_type: "jack_and_jill" as const },
  { id: "jnj-all", name: "All-level", comp_type: "jack_and_jill" as const },
  { id: "st-1", name: "Open Strictly", comp_type: "strictly" as const },
];

describe("resolveSignupDivisionIds", () => {
  it("requires division id when multiple JnJ divisions exist", () => {
    const result = resolveSignupDivisionIds(
      {
        strictlySelected: false,
        jnjSelected: true,
        allAmericanSelected: false,
      },
      competitions
    );
    expect("error" in result).toBe(true);
  });

  it("accepts explicit JnJ division", () => {
    const result = resolveSignupDivisionIds(
      {
        strictlySelected: false,
        jnjSelected: true,
        allAmericanSelected: false,
        jnjCompetitionId: "jnj-new",
      },
      competitions
    );
    expect(result).toEqual({
      jnj_competition_id: "jnj-new",
      strictly_competition_id: null,
      all_american_competition_id: null,
    });
  });

  it("auto-picks the only strictly division", () => {
    const result = resolveSignupDivisionIds(
      {
        strictlySelected: true,
        jnjSelected: false,
        allAmericanSelected: false,
      },
      competitions
    );
    expect(result).toEqual({
      jnj_competition_id: null,
      strictly_competition_id: "st-1",
      all_american_competition_id: null,
    });
  });
});

describe("signupMatchesCompetition", () => {
  const signup: Pick<
    CompSignupRow,
    | "jnj_selected"
    | "jnj_competition_id"
    | "strictly_selected"
    | "strictly_competition_id"
    | "all_american_selected"
    | "all_american_competition_id"
  > = {
    jnj_selected: true,
    jnj_competition_id: "jnj-new",
    strictly_selected: false,
    strictly_competition_id: null,
    all_american_selected: false,
    all_american_competition_id: null,
  };

  it("matches only the chosen JnJ division", () => {
    expect(
      signupMatchesCompetition(
        signup,
        { id: "jnj-new", comp_type: "jack_and_jill" },
        competitions
      )
    ).toBe(true);
    expect(
      signupMatchesCompetition(
        signup,
        { id: "jnj-all", comp_type: "jack_and_jill" },
        competitions
      )
    ).toBe(false);
  });
});

describe("divisionSelectionsChanged", () => {
  it("detects JnJ division change", () => {
    expect(
      divisionSelectionsChanged(
        {
          jnjCompetitionId: "jnj-new",
          strictlyCompetitionId: null,
          allAmericanCompetitionId: null,
        },
        { jnjCompetitionId: "jnj-all" }
      )
    ).toBe(true);
  });
});

describe("targetCompetitionIdForSignup", () => {
  it("uses patch override over stored signup id", () => {
    const signup = {
      jnj_selected: true,
      jnj_competition_id: "jnj-new",
      strictly_selected: false,
      strictly_competition_id: null,
      all_american_selected: false,
      all_american_competition_id: null,
    };
    expect(
      targetCompetitionIdForSignup(
        signup,
        "jack_and_jill",
        competitions,
        "jnj-all"
      )
    ).toBe("jnj-all");
  });
});
