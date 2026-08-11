import { describe, expect, it } from "vitest";
import {
  filterProfilesForStaffSearch,
  isCcsTeamProfile,
  parseStaffSearchScope,
} from "@/lib/compStaffProfileSearch";
import {
  canAccessCompEventOps,
  canManageCompEventStaff,
  isCompAdminRole,
} from "@/lib/comps/compAccessClient";

describe("isCcsTeamProfile", () => {
  it("includes admin and instructors, excludes non-ccs-instructor", () => {
    expect(isCcsTeamProfile("admin")).toBe(true);
    expect(isCcsTeamProfile("instructor")).toBe(true);
    expect(isCcsTeamProfile("non-ccs-instructor")).toBe(false);
    expect(isCcsTeamProfile("attendee")).toBe(false);
  });
});

describe("filterProfilesForStaffSearch", () => {
  const profiles = [
    { id: "1", role: "admin" },
    { id: "2", role: "instructor" },
    { id: "3", role: "attendee" },
    { id: "4", role: "non-ccs-instructor" },
  ];

  it("filters to CCS team by default scope", () => {
    const filtered = filterProfilesForStaffSearch(profiles, "ccs_team");
    expect(filtered.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("returns all profiles for all scope", () => {
    expect(filterProfilesForStaffSearch(profiles, "all")).toHaveLength(4);
  });
});

describe("parseStaffSearchScope", () => {
  it("defaults to ccs_team", () => {
    expect(parseStaffSearchScope(null)).toBe("ccs_team");
    expect(parseStaffSearchScope("all")).toBe("all");
  });
});

describe("isCompAdminRole", () => {
  it("matches admin role case-insensitively", () => {
    expect(isCompAdminRole("admin")).toBe(true);
    expect(isCompAdminRole("Admin")).toBe(true);
    expect(isCompAdminRole("instructor")).toBe(false);
  });
});

describe("compAccessClient", () => {
  it("grants admins full event access", () => {
    expect(
      canAccessCompEventOps({ profile: { id: "a", role: "admin" } }, "e1")
    ).toBe(true);
    expect(canManageCompEventStaff({ profile: { role: "admin" } })).toBe(true);
  });

  it("grants staff access only for assigned events", () => {
    const me = {
      profile: { id: "s1", role: "attendee" },
      comp_staff_events: [{ id: "e1", title: "Comp", starts_at: "2026-01-01" }],
    };
    expect(canAccessCompEventOps(me, "e1")).toBe(true);
    expect(canAccessCompEventOps(me, "e2")).toBe(false);
    expect(canManageCompEventStaff(me)).toBe(false);
  });

  it("isCompAdminRole mirrors server helper", () => {
    expect(isCompAdminRole("admin")).toBe(true);
    expect(isCompAdminRole("attendee")).toBe(false);
  });
});
