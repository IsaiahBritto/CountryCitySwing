import { describe, expect, it } from "vitest";
import {
  computeExpectedCompSignupTotal,
  computeExpectedJnJLineTotal,
  jnjAssignmentsChanged,
  signupSlotPatchFromAssignments,
  validateJnJAssignments,
} from "./jnjAssignments";

const comps = [
  { id: "jnj-new", name: "Newcomer", comp_type: "jack_and_jill" as const },
  { id: "jnj-all", name: "All", comp_type: "jack_and_jill" as const },
];

describe("validateJnJAssignments", () => {
  it("rejects same division twice", () => {
    const result = validateJnJAssignments(
      [
        { competitionId: "jnj-new", role: "lead" },
        { competitionId: "jnj-new", role: "follow" },
      ],
      comps,
      true
    );
    expect("error" in result).toBe(true);
  });

  it("rejects same role twice", () => {
    const result = validateJnJAssignments(
      [
        { competitionId: "jnj-new", role: "lead" },
        { competitionId: "jnj-all", role: "lead" },
      ],
      comps,
      true
    );
    expect("error" in result).toBe(true);
  });

  it("allows opposite roles in two divisions", () => {
    const result = validateJnJAssignments(
      [
        { competitionId: "jnj-new", role: "lead" },
        { competitionId: "jnj-all", role: "follow" },
      ],
      comps,
      true
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});

describe("pricing helpers", () => {
  it("doubles JnJ line when two assignments", () => {
    expect(computeExpectedJnJLineTotal(25, 2)).toBe(50);
    expect(
      computeExpectedCompSignupTotal({
        strictlySelected: false,
        strictlyPrice: null,
        jnjSelected: true,
        jnjPrice: 25,
        jnjAssignmentCount: 2,
      })
    ).toBe(50);
  });
});

describe("signupSlotPatchFromAssignments", () => {
  it("fills both lead and follow for dual opposite roles", () => {
    const patch = signupSlotPatchFromAssignments(
      [
        { competitionId: "jnj-new", role: "lead" },
        { competitionId: "jnj-all", role: "follow" },
      ],
      {
        firstName: "Alex",
        lastName: "Dancer",
        email: "alex@example.com",
        profileId: "p1",
      }
    );
    expect(patch.jnj_lead_profile_id).toBe("p1");
    expect(patch.jnj_follow_profile_id).toBe("p1");
    expect(patch.jnj_competition_id).toBe("jnj-new");
  });
});

describe("jnjAssignmentsChanged", () => {
  it("detects role swap on same division", () => {
    const current = [{ competitionId: "jnj-new", role: "lead" as const }];
    const next = [{ competitionId: "jnj-new", role: "follow" as const }];
    expect(jnjAssignmentsChanged(current, next)).toBe(true);
  });
});