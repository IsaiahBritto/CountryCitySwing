import { describe, it, expect } from "vitest";
import {
  computeUpperLevelBreakdown,
  countUpperLevelTowardCapacity,
  isUpperLevelRoleFull,
  validatePlannedClassAndRole,
} from "@/lib/upperLevelRegistration";

describe("computeUpperLevelBreakdown", () => {
  const signups = [
    {
      id: "1",
      first_name: "Alice",
      last_name: "Lead",
      email: "alice@example.com",
      checked_in: true,
      planned_class_level: "upper_level",
      planned_dance_role: "lead",
      is_ccs_team: false,
    },
    {
      id: "2",
      first_name: "Bob",
      last_name: "Follow",
      email: "bob@example.com",
      checked_in: false,
      planned_class_level: "upper_level",
      planned_dance_role: "follow",
      is_ccs_team: false,
    },
    {
      id: "3",
      first_name: "Carol",
      last_name: "Team",
      email: "carol@example.com",
      checked_in: true,
      planned_class_level: "upper_level",
      planned_dance_role: "lead",
      is_ccs_team: true,
    },
    {
      id: "4",
      first_name: "Dan",
      last_name: "Beginner",
      email: "dan@example.com",
      checked_in: false,
      planned_class_level: "beginner_side",
      planned_dance_role: null,
      is_ccs_team: false,
    },
    {
      id: "5",
      first_name: "Eve",
      last_name: "Cancelled",
      email: "eve@example.com",
      checked_in: false,
      planned_class_level: "upper_level",
      planned_dance_role: "follow",
      is_ccs_team: false,
      refunded_or_cancelled: "cancelled",
    },
  ];

  it("splits public and CCS Team upper level signups by role", () => {
    const breakdown = computeUpperLevelBreakdown(signups, {
      upper_level_lead_capacity: 5,
      upper_level_follow_capacity: 3,
    });

    expect(breakdown.public.lead.total).toBe(1);
    expect(breakdown.public.follow.total).toBe(1);
    expect(breakdown.ccsTeam.lead.total).toBe(1);
    expect(breakdown.ccsTeam.follow.total).toBe(0);
    expect(breakdown.totals.lead.total).toBe(2);
    expect(breakdown.totals.follow.total).toBe(1);
    expect(breakdown.public.lead.checked_in).toBe(1);
  });

  it("ignores cancelled and non-upper-level signups", () => {
    const breakdown = computeUpperLevelBreakdown(signups, {
      upper_level_lead_capacity: null,
      upper_level_follow_capacity: null,
    });
    expect(breakdown.totals.follow.total).toBe(1);
    expect(breakdown.public.follow.total).toBe(1);
  });
});

describe("countUpperLevelTowardCapacity", () => {
  const rows = [
    {
      id: "1",
      planned_class_level: "upper_level",
      planned_dance_role: "lead",
      is_ccs_team: false,
    },
    {
      id: "2",
      planned_class_level: "upper_level",
      planned_dance_role: "lead",
      is_ccs_team: true,
    },
    {
      id: "3",
      planned_class_level: "upper_level",
      planned_dance_role: "lead",
      is_ccs_team: false,
      refunded_or_cancelled: "cancelled",
    },
  ];

  it("counts only active non-CCS upper level signups for a role", () => {
    expect(countUpperLevelTowardCapacity(rows, "lead")).toBe(1);
  });

  it("can exclude a signup being edited", () => {
    expect(
      countUpperLevelTowardCapacity(rows, "lead", { excludeSignupId: "1" })
    ).toBe(0);
  });
});

describe("isUpperLevelRoleFull", () => {
  it("returns false when capacity is null", () => {
    expect(
      isUpperLevelRoleFull(
        { upper_level_lead_capacity: null, upper_level_follow_capacity: null },
        99,
        "lead"
      )
    ).toBe(false);
  });

  it("returns true when count meets capacity", () => {
    expect(
      isUpperLevelRoleFull(
        { upper_level_lead_capacity: 2, upper_level_follow_capacity: 1 },
        2,
        "lead"
      )
    ).toBe(true);
  });
});

describe("validatePlannedClassAndRole", () => {
  it("requires role for upper level when all three classes enabled", () => {
    expect(
      validatePlannedClassAndRole({
        allThreeClasses: true,
        plannedClassLevel: "upper_level",
        plannedDanceRole: null,
      })
    ).toEqual({
      ok: false,
      error: "Please select whether you are a Lead or Follow for Upper Level.",
    });
  });

  it("clears role requirement for non-upper levels", () => {
    expect(
      validatePlannedClassAndRole({
        allThreeClasses: true,
        plannedClassLevel: "lower_level",
        plannedDanceRole: null,
      })
    ).toEqual({ ok: true });
  });

  it("rejects role on non-upper levels", () => {
    expect(
      validatePlannedClassAndRole({
        allThreeClasses: true,
        plannedClassLevel: "lower_level",
        plannedDanceRole: "lead",
      })
    ).toEqual({
      ok: false,
      error: "Lead/Follow selection is only required for Upper Level.",
    });
  });
});
