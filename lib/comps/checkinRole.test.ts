import { describe, expect, it } from "vitest";
import {
  effectiveCheckinRole,
  isLeadCheckinEntry,
} from "@/lib/comps/checkinRole";

describe("effectiveCheckinRole", () => {
  it("prefers checkin_role when set", () => {
    expect(
      effectiveCheckinRole({
        checkin_role: "follow",
        entry: { role: "lead" },
      })
    ).toBe("follow");
  });

  it("falls back to entry role for legacy promoted rows", () => {
    expect(
      effectiveCheckinRole({
        checkin_role: null,
        entry: { role: "lead" },
      })
    ).toBe("lead");
    expect(isLeadCheckinEntry({ checkin_role: null, entry: { role: "lead" } })).toBe(
      true
    );
  });
});
