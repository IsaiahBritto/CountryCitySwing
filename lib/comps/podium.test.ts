import { describe, expect, it } from "vitest";
import { extractPodium, placementForRoundEntry } from "@/lib/comps/podium";

const sampleTabulation = {
  mode: "relative_placement" as const,
  entries: [
    { roundEntryId: "re-1", bibNumber: 101, displayName: "Alice & Bob" },
    { roundEntryId: "re-2", bibNumber: 102, displayName: "Carol & Dan" },
    { roundEntryId: "re-3", bibNumber: 103, displayName: "Eve & Frank" },
    { roundEntryId: "re-4", bibNumber: 104, displayName: "Gina & Hank" },
  ],
  grid: [
    { roundEntryId: "re-2", placement: 1 },
    { roundEntryId: "re-1", placement: 2 },
    { roundEntryId: "re-3", placement: 3 },
    { roundEntryId: "re-4", placement: 4 },
  ],
};

describe("extractPodium", () => {
  it("returns top 3 placements sorted", () => {
    expect(extractPodium(sampleTabulation)).toEqual([
      { placement: 1, displayName: "Carol & Dan", bibNumber: 102 },
      { placement: 2, displayName: "Alice & Bob", bibNumber: 101 },
      { placement: 3, displayName: "Eve & Frank", bibNumber: 103 },
    ]);
  });

  it("returns null for non-RP or missing data", () => {
    expect(extractPodium(null)).toBeNull();
    expect(extractPodium({ mode: "callback" })).toBeNull();
    expect(extractPodium({ mode: "relative_placement", entries: [], grid: [] })).toBeNull();
  });
});

describe("placementForRoundEntry", () => {
  it("returns placement for a round entry id", () => {
    expect(placementForRoundEntry(sampleTabulation, "re-3")).toBe(3);
    expect(placementForRoundEntry(sampleTabulation, "missing")).toBeNull();
  });
});
