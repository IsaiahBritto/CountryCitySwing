import { describe, expect, it } from "vitest";
import {
  applyCallbackVote,
  applyRawChangeForCallback,
  callbackPlacementConflicts,
  callbacksFromRawOrder,
  canSubmitCallbackPlacements,
  conflictedCallbackEntryIds,
  rawScoreForCallback,
  seedRawFromCallbacks,
} from "@/lib/scoring/callbackRawSync";

describe("callbackRawSync", () => {
  it("maps callback votes to canonical raw scores", () => {
    expect(rawScoreForCallback("yes")).toBe(100);
    expect(rawScoreForCallback("alt1")).toBe(75);
    expect(rawScoreForCallback("alt2")).toBe(65);
    expect(rawScoreForCallback("alt3")).toBe(55);
    expect(rawScoreForCallback("no")).toBe(20);
  });

  it("seeds raw scores from callback votes", () => {
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "alt1" as const],
      ["C", "no" as const],
    ]);
    const raw = seedRawFromCallbacks(["A", "B", "C"], votes);
    expect(raw.get("A")).toBe(100);
    expect(raw.get("B")).toBe(75);
    expect(raw.get("C")).toBe(20);
  });

  it("assigns callbacks by raw rank", () => {
    const raw = new Map([
      ["A", 70],
      ["B", 75],
      ["C", 20],
    ]);
    const votes = callbacksFromRawOrder(["A", "B", "C"], raw, {
      callbackCount: 1,
      alternateCount: 1,
    });
    expect(votes.get("B")).toBe("yes");
    expect(votes.get("A")).toBe("alt1");
    expect(votes.get("C")).toBe("no");
  });

  it("reassigns yes and alt1 when a yes drops below the former alt1", () => {
    const entryIds = ["A", "B", "C"];
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "alt1" as const],
      ["C", "no" as const],
    ]);
    const raw = seedRawFromCallbacks(entryIds, votes);

    const next = applyRawChangeForCallback(
      entryIds,
      votes,
      raw,
      "A",
      70,
      { callbackCount: 1, alternateCount: 1 }
    );

    expect(next.votes.get("B")).toBe("yes");
    expect(next.votes.get("A")).toBe("alt1");
    expect(next.rawById.get("A")).toBe(70);
    expect(next.rawById.get("B")).toBe(75);
  });

  it("allows yes overflow when applying callback votes", () => {
    const entryIds = ["A", "B"];
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "no" as const],
    ]);
    const raw = seedRawFromCallbacks(entryIds, votes);

    const next = applyCallbackVote(
      entryIds,
      votes,
      raw,
      "B",
      "yes",
      { callbackCount: 1, alternateCount: 0 }
    );
    expect(next.votes.get("A")).toBe("yes");
    expect(next.votes.get("B")).toBe("yes");
    expect(next.rawById.get("B")).toBe(100);
  });

  it("allows duplicate alternate rank without clearing previous holder", () => {
    const entryIds = ["A", "B", "C"];
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "alt1" as const],
      ["C", "no" as const],
    ]);
    const raw = seedRawFromCallbacks(entryIds, votes);

    const next = applyCallbackVote(
      entryIds,
      votes,
      raw,
      "C",
      "alt1",
      { callbackCount: 1, alternateCount: 1 }
    );
    expect(next.votes.get("B")).toBe("alt1");
    expect(next.votes.get("C")).toBe("alt1");
    expect(next.rawById.get("C")).toBe(75);
  });

  describe("callbackPlacementConflicts", () => {
    it("flags all yes voters on yes overflow", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
        ["C", "no" as const],
      ]);
      const conflicts = callbackPlacementConflicts(votes, {
        callbackCount: 1,
        alternateCount: 0,
      });
      expect(conflicts).toEqual([
        { type: "yes_overflow", entryIds: ["A", "B"] },
      ]);
      expect(conflictedCallbackEntryIds(votes, {
        callbackCount: 1,
        alternateCount: 0,
      }).sort()).toEqual(["A", "B"]);
    });

    it("flags duplicate alternate holders", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "alt1" as const],
      ]);
      const conflicts = callbackPlacementConflicts(votes, {
        callbackCount: 1,
        alternateCount: 1,
      });
      expect(conflicts).toEqual([
        { type: "alt_duplicate", rank: "alt1", entryIds: ["B", "C"] },
      ]);
    });
  });

  describe("canSubmitCallbackPlacements", () => {
    it("is false when ties exist", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
      ]);
      expect(
        canSubmitCallbackPlacements(votes, {
          callbackCount: 1,
          alternateCount: 0,
        })
      ).toBe(false);
    });

    it("is true when quotas met with no conflicts", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "no" as const],
      ]);
      expect(
        canSubmitCallbackPlacements(votes, {
          callbackCount: 1,
          alternateCount: 1,
        })
      ).toBe(true);
    });
  });
});
