import { describe, expect, it } from "vitest";
import {
  patchEntryCheckinStatus,
  recomputeCheckinCounts,
} from "@/lib/comps/checkinOptimistic";

describe("patchEntryCheckinStatus", () => {
  it("updates status and clears heat assignment when marked out", () => {
    const entries = [
      {
        id: "a",
        checkin_status: "checked_in" as const,
        heat_id: "h1",
        dance_order: 1,
      },
      { id: "b", checkin_status: "pending" as const },
    ];
    const next = patchEntryCheckinStatus(entries, "a", "absent");
    expect(next[0].checkin_status).toBe("absent");
    expect(next[0].heat_id).toBeNull();
    expect(next[0].dance_order).toBeNull();
    expect(next[1]).toEqual(entries[1]);
  });
});

describe("recomputeCheckinCounts", () => {
  it("matches event check-in count rules", () => {
    const entries = [
      { id: "1", checkin_status: "checked_in" as const, checkin_role: "lead" as const },
      { id: "2", checkin_status: "pending" as const, checkin_role: "lead" as const },
      { id: "3", checkin_status: "checked_in" as const, checkin_role: "follow" as const },
      { id: "4", checkin_status: "absent" as const, checkin_role: "follow" as const },
      { id: "5", checkin_status: "pending" as const, scratched: true },
    ];
    expect(recomputeCheckinCounts(entries, true)).toEqual({
      leadPresent: 1,
      followPresent: 1,
      leadUnresolved: 1,
      followUnresolved: 0,
      unresolvedCheckin: 1,
      presentCount: 2,
    });
  });
});
