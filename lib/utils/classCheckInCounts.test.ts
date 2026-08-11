import { describe, expect, it } from "vitest";
import {
  applyClassSignupCounts,
  computeClassLevelSummary,
  countClassSignupsByEmail,
  normalizeSignupEmail,
  PLANNED_CLASS_LEVELS,
  type ClassLevelSummary,
} from "@/lib/classLevels";

describe("countClassSignupsByEmail", () => {
  it("matches emails case-insensitively", () => {
    const counts = countClassSignupsByEmail(
      [
        { email: "Ada@Example.com" },
        { email: "ada@example.com" },
        { email: "other@example.com" },
      ],
      ["ADA@EXAMPLE.COM"]
    );

    expect(counts.get("ada@example.com")).toBe(2);
  });
});

describe("normalizeSignupEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeSignupEmail("  Foo@Bar.com ")).toBe("foo@bar.com");
  });

  it("returns null for empty values", () => {
    expect(normalizeSignupEmail("   ")).toBeNull();
    expect(normalizeSignupEmail(null)).toBeNull();
  });
});

describe("applyClassSignupCounts", () => {
  it("adds historical class signup counts to roster entries", () => {
    const summary = computeClassLevelSummary([
      {
        id: "1",
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        checked_in: true,
        planned_class_level: "upper_level",
      },
      {
        id: "2",
        first_name: "Grace",
        last_name: "Hopper",
        email: "grace@example.com",
        checked_in: false,
        planned_class_level: "upper_level",
      },
    ]);

    const enriched = applyClassSignupCounts(
      summary,
      new Map([
        ["ada@example.com", 4],
        ["grace@example.com", 0],
      ])
    );

    expect(enriched.roster.upper_level).toEqual([
      expect.objectContaining({
        first_name: "Ada",
        class_signup_count: 4,
      }),
      expect.objectContaining({
        first_name: "Grace",
        class_signup_count: 0,
      }),
    ]);

    for (const level of PLANNED_CLASS_LEVELS) {
      if (level === "upper_level") continue;
      expect(enriched.roster[level]).toEqual([]);
    }
  });
});

describe("computeClassLevelSummary", () => {
  it("includes email on roster entries", () => {
    const summary: ClassLevelSummary = computeClassLevelSummary([
      {
        id: "1",
        first_name: "Test",
        last_name: "User",
        email: "test@example.com",
        checked_in: false,
        planned_class_level: "beginner_side",
      },
    ]);

    expect(summary.roster.beginner_side[0]?.email).toBe("test@example.com");
  });
});
