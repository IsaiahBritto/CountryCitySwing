import { describe, expect, it } from "vitest";
import { entryIdsWithIndexChange } from "@/lib/scoring/scoringOrderMoveFade";

describe("entryIdsWithIndexChange", () => {
  it("returns ids whose index changed", () => {
    expect(
      entryIdsWithIndexChange(["a", "b", "c"], ["b", "a", "c"]).sort()
    ).toEqual(["a", "b"]);
  });

  it("returns empty when order is unchanged", () => {
    expect(entryIdsWithIndexChange(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("ignores ids that were not in the previous order", () => {
    expect(entryIdsWithIndexChange(["a"], ["a", "b"])).toEqual([]);
  });
});
