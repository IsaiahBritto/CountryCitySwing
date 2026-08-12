import { describe, expect, it } from "vitest";
import {
  placementForEntry,
  sortForDisplayOrder,
} from "@/lib/scoring/displayOrder";

describe("displayOrder", () => {
  const items = [
    { entryId: "c", bibNumber: 30, danceOrder: 1, raw: 65, ordinal: 3 },
    { entryId: "a", bibNumber: 10, danceOrder: 1, raw: 100, ordinal: 1 },
    { entryId: "b", bibNumber: 20, danceOrder: 1, raw: 75, ordinal: 2 },
  ];

  it("sorts by bib in bib order mode", () => {
    const sorted = sortForDisplayOrder(items, "bib");
    expect(sorted.map((i) => i.entryId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by raw desc with bib tiebreaker in score order raw mode", () => {
    const sorted = sortForDisplayOrder(items, "score", "raw");
    expect(sorted.map((i) => i.entryId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by ordinal in score order placement mode", () => {
    const sorted = sortForDisplayOrder(items, "score", "placement");
    expect(sorted.map((i) => i.entryId)).toEqual(["a", "b", "c"]);
  });

  it("puts null raw scores at the bottom in score order", () => {
    const mixed = [
      { entryId: "x", bibNumber: 5, raw: null },
      { entryId: "y", bibNumber: 10, raw: 50 },
    ];
    expect(sortForDisplayOrder(mixed, "score").map((i) => i.entryId)).toEqual([
      "y",
      "x",
    ]);
  });

  it("reads explicit ordinal from items", () => {
    const placementItems = [
      { entryId: "first", ordinal: 1 },
      { entryId: "second", ordinal: 2 },
    ];
    expect(placementForEntry(placementItems, "second")).toBe(2);
    expect(placementForEntry(placementItems, "missing")).toBeNull();
  });
});
