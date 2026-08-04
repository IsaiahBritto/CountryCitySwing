import { describe, expect, it } from "vitest";
import { listFinalsPlacements, ordinalPlacementLabel } from "@/lib/comps/finalsPlacements";

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

describe("listFinalsPlacements", () => {
  it("returns all placements sorted ascending", () => {
    expect(listFinalsPlacements(sampleTabulation)).toEqual([
      { placement: 1, roundEntryId: "re-2", displayName: "Carol & Dan", bibNumber: 102 },
      { placement: 2, roundEntryId: "re-1", displayName: "Alice & Bob", bibNumber: 101 },
      { placement: 3, roundEntryId: "re-3", displayName: "Eve & Frank", bibNumber: 103 },
      { placement: 4, roundEntryId: "re-4", displayName: "Gina & Hank", bibNumber: 104 },
    ]);
  });

  it("returns empty for invalid tabulation", () => {
    expect(listFinalsPlacements(null)).toEqual([]);
    expect(listFinalsPlacements({ mode: "callback" })).toEqual([]);
  });
});

describe("ordinalPlacementLabel", () => {
  it("formats ordinals", () => {
    expect(ordinalPlacementLabel(1)).toBe("1st");
    expect(ordinalPlacementLabel(2)).toBe("2nd");
    expect(ordinalPlacementLabel(3)).toBe("3rd");
    expect(ordinalPlacementLabel(11)).toBe("11th");
  });
});
