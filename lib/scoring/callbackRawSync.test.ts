import { describe, expect, it } from "vitest";
import {
  altPlacementRaw,
  applyCallbackVote,
  applyRawChangeForCallback,
  callbackPlacementConflicts,
  callbackRawTiedEntryIds,
  callbacksFromRawOrder,
  canSubmitCallbackPlacements,
  conflictedCallbackEntryIds,
  noPlacementRaw,
  rawScoreForCallback,
  rawScoreForPlacementVote,
  repackPlacementRaws,
  seedRawFromCallbacks,
  yesPlacementRaw,
  type CallbackVote,
} from "@/lib/scoring/callbackRawSync";

const limits10 = { callbackCount: 10, alternateCount: 1 };

describe("callbackRawSync", () => {
  it("maps callback votes to canonical raw scores", () => {
    expect(rawScoreForCallback("yes")).toBe(100);
    expect(rawScoreForCallback("alt1")).toBe(75);
    expect(rawScoreForCallback("alt2")).toBe(65);
    expect(rawScoreForCallback("alt3")).toBe(55);
    expect(rawScoreForCallback("no")).toBe(20);
  });

  it("seeds spread raw scores from callback votes in entry order", () => {
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "alt1" as const],
      ["C", "no" as const],
    ]);
    const raw = seedRawFromCallbacks(["A", "B", "C"], votes, {
      callbackCount: 10,
      alternateCount: 1,
    });
    expect(raw.get("A")).toBe(100);
    expect(raw.get("B")).toBe(60);
    expect(raw.get("C")).toBe(1);
  });

  it("does not seed raw scores when no placement votes exist", () => {
    const raw = seedRawFromCallbacks(["A", "B", "C"], new Map(), limits10);
    expect(raw.size).toBe(0);
  });

  it("seeds only competitors with explicit placement votes", () => {
    const votes = new Map([["A", "yes" as const]]);
    const raw = seedRawFromCallbacks(["A", "B", "C"], votes, limits10);
    expect(raw.get("A")).toBe(100);
    expect(raw.has("B")).toBe(false);
    expect(raw.has("C")).toBe(false);
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

  it("ignores unscored competitors when assigning callbacks from raw rank", () => {
    const raw = new Map<string, number | null>([
      ["A", 90],
      ["B", null],
      ["C", null],
    ]);
    const votes = callbacksFromRawOrder(["A", "B", "C"], raw, {
      callbackCount: 2,
      alternateCount: 1,
    });
    expect(votes.get("A")).toBe("yes");
    expect(votes.has("B")).toBe(false);
    expect(votes.has("C")).toBe(false);
    expect(votes.size).toBe(1);
  });

  it("assigns only one yes when one competitor is scored on a blank sheet", () => {
    const entryIds = ["A", "B", "C", "D"];
    const votes = new Map<string, "yes" | "alt1" | "alt2" | "alt3" | "no">();
    const raw = new Map<string, number | null>();

    const next = applyRawChangeForCallback(
      entryIds,
      votes,
      raw,
      "A",
      85,
      { callbackCount: 2, alternateCount: 1 }
    );

    expect(next.votes.get("A")).toBe("yes");
    expect(next.votes.has("B")).toBe(false);
    expect(next.votes.has("C")).toBe(false);
    expect(next.votes.has("D")).toBe(false);
    expect(next.rawById.get("A")).toBe(85);
  });

  it("reassigns yes and alt1 when a yes drops below the former alt1", () => {
    const entryIds = ["A", "B", "C"];
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "alt1" as const],
      ["C", "no" as const],
    ]);
    const raw = new Map<string, number | null>([
      ["A", 53],
      ["B", 52],
      ["C", 1],
    ]);

    const next = applyRawChangeForCallback(
      entryIds,
      votes,
      raw,
      "A",
      51,
      { callbackCount: 1, alternateCount: 1 }
    );

    expect(next.votes.get("B")).toBe("yes");
    expect(next.votes.get("A")).toBe("alt1");
    expect(next.rawById.get("A")).toBe(51);
    expect(next.rawById.get("B")).toBe(52);
  });

  it("allows yes overflow when applying callback votes", () => {
    const entryIds = ["A", "B"];
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "no" as const],
    ]);
    const raw = seedRawFromCallbacks(entryIds, votes, {
      callbackCount: 1,
      alternateCount: 0,
    });

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
    const raw = seedRawFromCallbacks(entryIds, votes, {
      callbackCount: 1,
      alternateCount: 1,
    });

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
    expect(next.rawById.get("C")).toBe(60);
  });

  describe("rawScoreForPlacementVote / spread", () => {
    const limits = { callbackCount: 10, alternateCount: 1 };

    it("assigns sequential yes raws 100, 99, 98 for quota 10", () => {
      const votes = new Map<string, "yes" | "no">();
      const raw = new Map<string, number | null>();

      expect(
        rawScoreForPlacementVote("yes", votes, raw, limits, "A")
      ).toBe(100);
      votes.set("A", "yes");
      raw.set("A", 100);

      expect(
        rawScoreForPlacementVote("yes", votes, raw, limits, "B")
      ).toBe(99);
      votes.set("B", "yes");
      raw.set("B", 99);

      expect(
        rawScoreForPlacementVote("yes", votes, raw, limits, "C")
      ).toBe(98);
    });

    it("assigns 10 yes in order without raw ties via applyCallbackVote", () => {
      const entryIds = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"];
      let votes = new Map<string, "yes" | "no">();
      let raw = new Map<string, number | null>();

      for (const id of entryIds) {
        const next = applyCallbackVote(
          entryIds,
          votes,
          raw,
          id,
          "yes",
          limits
        );
        votes = next.votes;
        raw = next.rawById;
      }

      const raws = entryIds.map((id) => raw.get(id)!);
      expect(raws).toEqual([100, 99, 98, 97, 96, 95, 94, 93, 92, 91]);
      expect(new Set(raws).size).toBe(10);
    });

    it("matches lowest yes raw on yes overflow", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
        ["C", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 88],
        ["B", 52],
        ["C", 1],
      ]);
      expect(
        rawScoreForPlacementVote("yes", votes, raw, { callbackCount: 2, alternateCount: 0 }, "C")
      ).toBe(52);
    });

    it("assigns alt1 at 60 before any yes", () => {
      const votes = new Map<string, "no">();
      const raw = new Map<string, number | null>();
      expect(
        rawScoreForPlacementVote("alt1", votes, raw, limits, "A")
      ).toBe(60);
    });

    it("assigns alt1 at preset when min yes is at or above 60", () => {
      const votes = new Map<string, "yes">([["Y0", "yes"]]);
      const raw = new Map<string, number | null>([["Y0", 100]]);
      expect(
        rawScoreForPlacementVote("alt1", votes, raw, limits, "A")
      ).toBe(60);
    });

    it("assigns alt1 below min yes when yes band compresses under 60", () => {
      const votes = new Map<string, "yes">();
      const raw = new Map<string, number | null>();
      for (let i = 0; i < 8; i++) {
        const id = `Y${i}`;
        votes.set(id, "yes");
        raw.set(id, 59 - i);
      }
      expect(
        rawScoreForPlacementVote("alt1", votes, raw, limits, "A")
      ).toBe(51);
      expect(
        rawScoreForPlacementVote("alt2", votes, raw, limits, "B")
      ).toBe(50);
      expect(
        rawScoreForPlacementVote("alt3", votes, raw, limits, "B")
      ).toBe(49);
    });

    it("matches existing alt1 holder raw on duplicate alt1", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 90],
        ["B", 45],
        ["C", 1],
      ]);
      expect(
        rawScoreForPlacementVote("alt1", votes, raw, { callbackCount: 1, alternateCount: 1 }, "C")
      ).toBe(45);
    });

    it("assigns sequential nos 1, 2, 3", () => {
      const votes = new Map<string, "no">();
      const raw = new Map<string, number | null>();

      expect(rawScoreForPlacementVote("no", votes, raw, limits, "A")).toBe(1);
      votes.set("A", "no");
      raw.set("A", 1);

      expect(rawScoreForPlacementVote("no", votes, raw, limits, "B")).toBe(2);
      votes.set("B", "no");
      raw.set("B", 2);

      expect(rawScoreForPlacementVote("no", votes, raw, limits, "C")).toBe(3);
    });

    it("compresses yes spread when callbackCount exceeds 50", () => {
      const score = yesPlacementRaw(0, 60);
      expect(score).toBe(100);
      const last = yesPlacementRaw(59, 60);
      expect(last).toBeGreaterThan(50);
      expect(last).toBeLessThanOrEqual(51);
    });

    it("seedRawFromCallbacks uses spread not canonical 75/20", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "no" as const],
      ]);
      const raw = seedRawFromCallbacks(["A", "B", "C"], votes, limits);
      expect(raw.get("A")).toBe(100);
      expect(raw.get("B")).toBe(60);
      expect(raw.get("C")).toBe(1);
    });
  });

  describe("spread helpers", () => {
    it("yesPlacementRaw steps down by 1 for small quotas", () => {
      expect(yesPlacementRaw(0, 10)).toBe(100);
      expect(yesPlacementRaw(1, 10)).toBe(99);
      expect(yesPlacementRaw(9, 10)).toBe(91);
    });

    it("noPlacementRaw is sequential from 1 up to 30", () => {
      expect(noPlacementRaw(0)).toBe(1);
      expect(noPlacementRaw(2, 3)).toBe(3);
      expect(noPlacementRaw(29, 30)).toBe(30);
    });

    it("compresses no spread when count exceeds 30", () => {
      expect(noPlacementRaw(0, 31)).toBe(1);
      const last = noPlacementRaw(30, 31);
      expect(last).toBeLessThanOrEqual(30);
      expect(last).toBeGreaterThanOrEqual(29);
    });

    it("altPlacementRaw without yes uses 60, 59, 58", () => {
      const votes = new Map<string, "alt1" | "alt2">();
      const raw = new Map<string, number | null>();
      expect(altPlacementRaw("alt1", votes, raw, "A")).toBe(60);
      votes.set("A", "alt1");
      raw.set("A", 60);
      expect(altPlacementRaw("alt2", votes, raw, "B")).toBe(59);
    });

    it("altPlacementRaw uses preset when min yes is 100", () => {
      const votes = new Map<string, "yes">([["Y", "yes"]]);
      const raw = new Map<string, number | null>([["Y", 100]]);
      expect(altPlacementRaw("alt1", votes, raw, "A")).toBe(60);
      expect(altPlacementRaw("alt2", votes, raw, "B")).toBe(59);
      expect(altPlacementRaw("alt3", votes, raw, "C")).toBe(58);
    });

    it("altPlacementRaw steps down from min yes when min yes is under 60", () => {
      const votes = new Map<string, "yes">([["Y", "yes"]]);
      const raw = new Map<string, number | null>([["Y", 52]]);
      expect(altPlacementRaw("alt1", votes, raw, "A")).toBe(51);
      expect(altPlacementRaw("alt2", votes, raw, "B")).toBe(50);
      expect(altPlacementRaw("alt3", votes, raw, "C")).toBe(49);
    });

    it("altPlacementRaw steps down from min yes 59", () => {
      const votes = new Map<string, "yes">([["Y", "yes"]]);
      const raw = new Map<string, number | null>([["Y", 59]]);
      expect(altPlacementRaw("alt1", votes, raw, "A")).toBe(58);
      expect(altPlacementRaw("alt2", votes, raw, "B")).toBe(57);
      expect(altPlacementRaw("alt3", votes, raw, "C")).toBe(56);
    });

    it("altPlacementRaw lifts above max no when needed", () => {
      const votes = new Map<string, "yes" | "no">([
        ["Y", "yes"],
        ["N", "no"],
      ]);
      const raw = new Map<string, number | null>([
        ["Y", 100],
        ["N", 55],
      ]);
      expect(altPlacementRaw("alt1", votes, raw, "A")).toBe(60);
    });
  });

  describe("repackPlacementRaws", () => {
    const limits3 = { callbackCount: 10, alternateCount: 1 };

    it("fills yes gap after reassigning middle yes to no", () => {
      const entryIds = ["A", "B", "C", "D"];
      let votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "yes"],
        ["C", "yes"],
      ]);
      let raw = seedRawFromCallbacks(entryIds, votes, limits3);

      let next = applyCallbackVote(entryIds, votes, raw, "B", "no", limits3);
      votes = next.votes;
      raw = next.rawById;
      expect(raw.get("A")).toBe(100);
      expect(raw.get("C")).toBe(99);
      expect(raw.get("B")).toBe(1);

      next = applyCallbackVote(entryIds, votes, raw, "D", "yes", limits3);
      expect(next.rawById.get("D")).toBe(98);
      expect(callbackRawTiedEntryIds(next.rawById)).toEqual([]);
    });

    it("repacks nos densely after reassigning first no to yes", () => {
      const entryIds = ["A", "B", "C"];
      let votes = new Map<string, CallbackVote>([
        ["A", "no"],
        ["B", "no"],
      ]);
      let raw = seedRawFromCallbacks(entryIds, votes, limits3);

      let next = applyCallbackVote(entryIds, votes, raw, "A", "yes", limits3);
      votes = next.votes;
      raw = next.rawById;
      expect(raw.get("A")).toBe(100);
      expect(raw.get("B")).toBe(1);

      next = applyCallbackVote(entryIds, votes, raw, "C", "no", limits3);
      expect(next.rawById.get("C")).toBe(2);
      expect(callbackRawTiedEntryIds(next.rawById)).toEqual([]);
    });

    it("preserves manual yes while repacking other automated yes", () => {
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "yes"],
        ["C", "yes"],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 85],
        ["B", 99],
        ["C", 98],
      ]);
      const automated = new Set(["B", "C"]);
      const repacked = repackPlacementRaws(votes, raw, limits3, automated);
      expect(repacked.get("A")).toBe(85);
      expect(repacked.get("B")).toBe(100);
      expect(repacked.get("C")).toBe(99);
    });

    it("keeps overflow yes tied at min in-quota raw after repack", () => {
      const entryIds = ["A", "B"];
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "yes"],
      ]);
      const raw = seedRawFromCallbacks(entryIds, votes, {
        callbackCount: 1,
        alternateCount: 0,
      });
      expect(raw.get("A")).toBe(100);
      expect(raw.get("B")).toBe(100);
    });

    it("keeps duplicate alt holders tied after repack", () => {
      const entryIds = ["A", "B", "C"];
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "alt1"],
        ["C", "alt1"],
      ]);
      const raw = seedRawFromCallbacks(entryIds, votes, {
        callbackCount: 1,
        alternateCount: 1,
      });
      expect(raw.get("B")).toBe(raw.get("C"));
    });
  });

  describe("applyCallbackVote with custom raw scores", () => {
    it("sets duplicate alt1 to existing holder raw score", () => {
      const entryIds = ["A", "B", "C"];
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 90],
        ["B", 45],
        ["C", 1],
      ]);

      const next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "C",
        "alt1",
        { callbackCount: 1, alternateCount: 1 },
        new Set(["C"])
      );

      expect(next.votes.get("C")).toBe("alt1");
      expect(next.rawById.get("C")).toBe(45);
      expect(next.rawById.get("B")).toBe(45);
    });

    it("sets overflow yes to lowest existing yes raw", () => {
      const entryIds = ["A", "B", "C"];
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
        ["C", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 88],
        ["B", 52],
        ["C", 1],
      ]);

      const next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "C",
        "yes",
        { callbackCount: 2, alternateCount: 0 },
        new Set(["C"])
      );

      expect(next.votes.get("C")).toBe("yes");
      expect(next.rawById.get("C")).toBe(52);
    });
  });

  it("does nothing when re-selecting the same callback vote", () => {
    const entryIds = ["A", "B"];
    const votes = new Map([
      ["A", "yes" as const],
      ["B", "alt1" as const],
    ]);
    const raw = seedRawFromCallbacks(entryIds, votes, {
      callbackCount: 1,
      alternateCount: 1,
    });

    const yesAgain = applyCallbackVote(
      entryIds,
      votes,
      raw,
      "A",
      "yes",
      { callbackCount: 1, alternateCount: 1 }
    );
    expect(yesAgain.votes).toBe(votes);
    expect(yesAgain.rawById).toBe(raw);

    const altAgain = applyCallbackVote(
      entryIds,
      votes,
      raw,
      "B",
      "alt1",
      { callbackCount: 1, alternateCount: 1 }
    );
    expect(altAgain.votes).toBe(votes);
    expect(altAgain.rawById).toBe(raw);
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

  describe("conflictedCallbackEntryIds", () => {
    const limits = { callbackCount: 10, alternateCount: 1 };

    it("returns empty when yes overflow but no duplicate raw scores", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
        ["C", "yes" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 90],
        ["B", 88],
        ["C", 58],
      ]);
      expect(conflictedCallbackEntryIds(votes, limits, raw)).toEqual([]);
    });

    it("returns only competitors with duplicate raw scores", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 49],
        ["B", 49],
        ["C", 90],
      ]);
      expect(conflictedCallbackEntryIds(votes, limits, raw).sort()).toEqual([
        "A",
        "B",
      ]);
      expect(callbackRawTiedEntryIds(raw).sort()).toEqual(["A", "B"]);
    });
  });

  describe("canSubmitCallbackPlacements", () => {
    it("is false when yes overflow without raw ties", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 90],
        ["B", 88],
      ]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          { callbackCount: 1, alternateCount: 0 },
          ["A", "B"],
          raw
        )
      ).toBe(false);
    });

    it("is false when raw score ties exist", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
        ["C", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 49],
        ["B", 49],
        ["C", 1],
      ]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          { callbackCount: 1, alternateCount: 0 },
          ["A", "B", "C"],
          raw
        )
      ).toBe(false);
    });

    it("is false when vote-level yes overflow without rawById", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
      ]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          {
            callbackCount: 1,
            alternateCount: 0,
          },
          ["A", "B"]
        )
      ).toBe(false);
    });

    it("is false when any entry is unknown", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
      ]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          {
            callbackCount: 1,
            alternateCount: 1,
          },
          ["A", "B", "C"]
        )
      ).toBe(false);
    });

    it("is true when quotas met with no conflicts", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "no" as const],
      ]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          {
            callbackCount: 1,
            alternateCount: 1,
          },
          ["A", "B", "C"]
        )
      ).toBe(true);
    });
  });
});
