import { describe, expect, it } from "vitest";
import {
  computeReviewerMetaMerge,
  lineDanceCompletionStatus,
  type LineDanceMatchSource,
} from "@/lib/spotify/lineDanceMetaLogic";

function baseRow(
  overrides: Partial<{
    match_source: LineDanceMatchSource;
    line_dance_name: string | null;
    level: string | null;
    level_raw: string | null;
  }> = {}
): {
  match_source: LineDanceMatchSource;
  line_dance_name: string | null;
  level: string | null;
  level_raw: string | null;
} {
  return {
    match_source: "none",
    line_dance_name: null,
    level: null,
    level_raw: null,
    ...overrides,
  };
}

describe("lineDanceCompletionStatus", () => {
  it("returns empty when both fields missing", () => {
    expect(lineDanceCompletionStatus({ line_dance_name: null, level: null })).toBe(
      "empty"
    );
  });

  it("returns partial when only one field present", () => {
    expect(
      lineDanceCompletionStatus({ line_dance_name: "Crawl", level: null })
    ).toBe("partial");
    expect(
      lineDanceCompletionStatus({ line_dance_name: null, level: "beginner" })
    ).toBe("partial");
  });

  it("returns complete when both fields present", () => {
    expect(
      lineDanceCompletionStatus({
        line_dance_name: "Crawl",
        level: "beginner",
      })
    ).toBe("complete");
  });
});

describe("computeReviewerMetaMerge", () => {
  it("saves name only and keeps needs_recheck true", () => {
    const result = computeReviewerMetaMerge(baseRow(), {
      lineDanceName: "Watermelon Crawl",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line_dance_name).toBe("Watermelon Crawl");
    expect(result.level).toBeNull();
    expect(result.needs_recheck).toBe(true);
  });

  it("saves level only and keeps needs_recheck true", () => {
    const result = computeReviewerMetaMerge(baseRow(), { level: "improver" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line_dance_name).toBeNull();
    expect(result.level).toBe("improver");
    expect(result.level_raw).toBe("improver");
    expect(result.needs_recheck).toBe(true);
  });

  it("saves both fields and clears needs_recheck", () => {
    const result = computeReviewerMetaMerge(
      baseRow({ line_dance_name: "Crawl" }),
      { level: "beginner" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line_dance_name).toBe("Crawl");
    expect(result.level).toBe("beginner");
    expect(result.needs_recheck).toBe(false);
  });

  it("merges a second partial save into a complete row", () => {
    const partial = computeReviewerMetaMerge(baseRow(), {
      lineDanceName: "Crawl",
    });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;

    const complete = computeReviewerMetaMerge(
      {
        match_source: "reviewer",
        line_dance_name: partial.line_dance_name,
        level: partial.level,
        level_raw: partial.level_raw,
      },
      { level: "advanced" }
    );
    expect(complete.ok).toBe(true);
    if (!complete.ok) return;
    expect(complete.line_dance_name).toBe("Crawl");
    expect(complete.level).toBe("advanced");
    expect(complete.needs_recheck).toBe(false);
  });

  it("rejects admin-confirmed rows", () => {
    const result = computeReviewerMetaMerge(
      baseRow({
        match_source: "admin",
        line_dance_name: "Locked",
        level: "beginner",
      }),
      { lineDanceName: "New Name" }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("Admin-confirmed row cannot be modified");
  });

  it("requires at least one field", () => {
    const result = computeReviewerMetaMerge(baseRow(), {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(
      "At least one of lineDanceName or level is required"
    );
  });
});
