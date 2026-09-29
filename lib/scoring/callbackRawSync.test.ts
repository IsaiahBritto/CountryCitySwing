import { describe, expect, it } from "vitest";
import {
  altPlacementRaw,
  applyCallbackVote,
  applyRawChangeForCallback,
  callbackPlacementConflicts,
  callbackMaterialRawTieGroups,
  callbackMaterialRawTiedEntryIds,
  callbackRawTiedEntryIds,
  callbackRawTieGroups,
  callbacksFromRawOrder,
  canSubmitCallbackPlacements,
  conflictedCallbackEntryIds,
  noPlacementRaw,
  rawScoreForCallback,
  rawScoreForPlacementVote,
  repackPlacementRaws,
  seedRawFromCallbacks,
  syncIntentionalPlacementTies,
  isStaleNoRawOnAltVote,
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

  it("respects yes and alt quotas when many competitors share one raw", () => {
    const entryIds = Array.from({ length: 12 }, (_, i) => `E${i}`);
    const raw = new Map<string, number | null>(
      entryIds.map((id) => [id, 100])
    );
    const limits = { callbackCount: 10, alternateCount: 1 };
    const votes = callbacksFromRawOrder(entryIds, raw, limits);
    const yesCount = [...votes.values()].filter((v) => v === "yes").length;
    const alt1Count = [...votes.values()].filter((v) => v === "alt1").length;
    const noCount = [...votes.values()].filter((v) => v === "no").length;
    expect(yesCount).toBe(10);
    expect(alt1Count).toBe(1);
    expect(noCount).toBe(1);
  });

  it("assigns consecutive quota slots for tied raw at the top", () => {
    const raw = new Map<string, number | null>([
      ["A", 75],
      ["B", 75],
      ["C", 20],
    ]);
    const votes = callbacksFromRawOrder(["A", "B", "C"], raw, {
      callbackCount: 1,
      alternateCount: 1,
    });
    expect(votes.get("A")).toBe("yes");
    expect(votes.get("B")).toBe("alt1");
    expect(votes.get("C")).toBe("no");
  });

  it("gives both competitors alt1 when raw ties at the alternate band", () => {
    const raw = new Map<string, number | null>([
      ["A", 100],
      ["B", 49],
      ["C", 49],
    ]);
    const votes = callbacksFromRawOrder(["A", "B", "C"], raw, {
      callbackCount: 1,
      alternateCount: 1,
    });
    expect(votes.get("A")).toBe("yes");
    expect(votes.get("B")).toBe("alt1");
    expect(votes.get("C")).toBe("alt1");
  });

  it("assigns both alt1 when a lower raw is moved to match existing alt1", () => {
    const entryIds = ["A", "B", "C"];
    const votes = new Map<string, CallbackVote>([
      ["A", "yes"],
      ["B", "alt1"],
      ["C", "no"],
    ]);
    const raw = new Map<string, number | null>([
      ["A", 100],
      ["B", 49],
      ["C", 20],
    ]);
    const next = applyRawChangeForCallback(
      entryIds,
      votes,
      raw,
      "C",
      49,
      { callbackCount: 1, alternateCount: 1 }
    );
    expect(next.votes.get("B")).toBe("alt1");
    expect(next.votes.get("C")).toBe("alt1");
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

    it("returns empty when duplicate raw is same placement vote", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "yes" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 49],
        ["B", 49],
        ["C", 90],
      ]);
      expect(conflictedCallbackEntryIds(votes, limits, raw)).toEqual([]);
      expect(callbackRawTiedEntryIds(raw).sort()).toEqual(["A", "B"]);
    });

    it("returns ids when duplicate raw crosses placement votes", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 49],
        ["B", 49],
      ]);
      expect(conflictedCallbackEntryIds(votes, limits, raw).sort()).toEqual([
        "A",
        "B",
      ]);
    });
  });

  describe("callbackMaterialRawTieGroups", () => {
    it("ignores all No rows sharing the same raw", () => {
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "alt1"],
        ["C", "no"],
        ["D", "no"],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 100],
        ["B", 60],
        ["C", 2],
        ["D", 2],
      ]);
      expect(callbackMaterialRawTieGroups(votes, raw)).toEqual([]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          { callbackCount: 1, alternateCount: 1 },
          ["A", "B", "C", "D"],
          raw
        )
      ).toBe(true);
    });

    it("allows two Yes at same raw when quotas match", () => {
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "yes"],
        ["C", "no"],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 88],
        ["B", 88],
        ["C", 1],
      ]);
      expect(callbackMaterialRawTieGroups(votes, raw)).toEqual([]);
      expect(
        canSubmitCallbackPlacements(
          votes,
          { callbackCount: 2, alternateCount: 0 },
          ["A", "B", "C"],
          raw
        )
      ).toBe(true);
    });

    it("flags Yes vs No at same raw", () => {
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "no"],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 49],
        ["B", 49],
      ]);
      expect(callbackMaterialRawTiedEntryIds(votes, raw).sort()).toEqual([
        "A",
        "B",
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

    it("is false when material cross-vote raw ties exist", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "no" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 49],
        ["B", 49],
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

  describe("syncIntentionalPlacementTies and overflow at quota 10", () => {
    it("gives 11th yes the same raw as lowest in-quota yes", () => {
      const limits = { callbackCount: 10, alternateCount: 0 };
      const entryIds = Array.from({ length: 11 }, (_, i) => `E${i}`);
      let votes = new Map<string, CallbackVote>();
      let raw = new Map<string, number | null>();
      const automated = new Set<string>();

      for (const id of entryIds) {
        const next = applyCallbackVote(
          entryIds,
          votes,
          raw,
          id,
          "yes",
          limits,
          automated
        );
        votes = next.votes;
        raw = next.rawById;
        automated.add(id);
      }

      const yesRaws = entryIds.map((id) => raw.get(id)!);
      const minRaw = Math.min(...yesRaws);
      const atMin = yesRaws.filter((r) => r === minRaw).length;
      expect(atMin).toBeGreaterThanOrEqual(2);
      expect(new Set(yesRaws.filter((r) => r === minRaw)).size).toBe(1);
    });

    it("syncs duplicate alt1 holders including manual raw", () => {
      const votes = new Map([
        ["A", "yes" as const],
        ["B", "alt1" as const],
        ["C", "alt1" as const],
      ]);
      const raw = new Map<string, number | null>([
        ["A", 90],
        ["B", 45],
        ["C", 60],
      ]);
      const synced = syncIntentionalPlacementTies(votes, raw, {
        callbackCount: 1,
        alternateCount: 1,
      });
      expect(synced.get("B")).toBe(45);
      expect(synced.get("C")).toBe(45);
    });
  });

  describe("callbackRawTieGroups", () => {
    it("returns groups of duplicate raws only", () => {
      const raw = new Map<string, number | null>([
        ["A", 50],
        ["B", 50],
        ["C", 40],
      ]);
      expect(callbackRawTieGroups(raw)).toEqual([["A", "B"]]);
    });
  });

  describe("Yes vs Alt raw bands", () => {
    it("moves overflow Yes raw off alt1 after vote change", () => {
      const entryIds = ["A", "B", "C"];
      const limits = { callbackCount: 2, alternateCount: 1 };
      let votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "yes"],
        ["C", "no"],
      ]);
      let raw = new Map<string, number | null>([
        ["A", 88],
        ["B", 52],
        ["C", 1],
      ]);
      const automated = new Set(["C"]);

      let next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "C",
        "yes",
        limits,
        automated
      );
      expect(next.rawById.get("C")).toBe(52);

      next = applyCallbackVote(
        entryIds,
        next.votes,
        next.rawById,
        "C",
        "alt1",
        limits,
        automated
      );
      const cRaw = next.rawById.get("C")!;
      expect(cRaw).not.toBe(52);
      expect(cRaw).not.toBe(88);
      expect(cRaw).toBe(51);
    });

    it("does not tie Yes and Alt1 raws on a full quota sheet", () => {
      const limits = { callbackCount: 10, alternateCount: 1 };
      const yesIds = Array.from({ length: 10 }, (_, i) => `Y${i}`);
      const entryIds = [...yesIds, "ALT"];
      let votes = new Map<string, CallbackVote>();
      let raw = new Map<string, number | null>();
      const automated = new Set<string>();

      for (const id of yesIds) {
        const next = applyCallbackVote(
          entryIds,
          votes,
          raw,
          id,
          "yes",
          limits,
          automated
        );
        votes = next.votes;
        raw = next.rawById;
        automated.add(id);
      }

      const altNext = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "ALT",
        "alt1",
        limits,
        automated
      );
      raw = altNext.rawById;
      const altRaw = raw.get("ALT")!;
      for (const yid of yesIds) {
        expect(raw.get(yid)).not.toBe(altRaw);
      }
      expect(callbackRawTiedEntryIds(raw)).not.toContain("ALT");
    });

    it("preserves valid manual alt raw but clears stale Yes on alt", () => {
      const votes = new Map<string, CallbackVote>([
        ["A", "yes"],
        ["B", "alt1"],
      ]);
      const validManual = new Map<string, number | null>([
        ["A", 93],
        ["B", 45],
      ]);
      const repackedValid = repackPlacementRaws(
        votes,
        validManual,
        { callbackCount: 1, alternateCount: 1 },
        new Set()
      );
      expect(repackedValid.get("B")).toBe(45);

      const stale = new Map<string, number | null>([
        ["A", 93],
        ["B", 93],
      ]);
      const fixed = repackPlacementRaws(
        votes,
        stale,
        { callbackCount: 1, alternateCount: 1 },
        new Set()
      );
      expect(fixed.get("B")).toBe(60);
      expect(fixed.get("A")).toBe(93);
    });

    it("clears stale Yes raw when eleventh Yes becomes alt1 after overflow", () => {
      const limits = { callbackCount: 10, alternateCount: 1 };
      const yesIds = Array.from({ length: 10 }, (_, i) => `Y${i}`);
      const entryIds = [...yesIds, "OVERFLOW"];
      let votes = new Map<string, CallbackVote>();
      let raw = new Map<string, number | null>();
      const automated = new Set(yesIds);

      for (let i = 0; i < 10; i++) {
        votes.set(yesIds[i]!, "yes");
      }
      for (let i = 0; i < 10; i++) {
        raw.set(yesIds[i]!, yesPlacementRaw(i, 10));
      }
      votes.set("OVERFLOW", "yes");
      raw.set("OVERFLOW", 91);

      let next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "OVERFLOW",
        "alt1",
        limits,
        new Set([...automated, "OVERFLOW"])
      );
      const overflowRaw = next.rawById.get("OVERFLOW")!;
      const minYes = Math.min(
        ...yesIds.map((id) => next.rawById.get(id)!).filter(Boolean)
      );
      expect(overflowRaw).not.toBe(minYes);
      expect(overflowRaw).toBe(60);
    });
  });

  describe("duplicate Alt and stale No-band raw", () => {
    it("isStaleNoRawOnAltVote flags No-band leftovers only", () => {
      expect(isStaleNoRawOnAltVote(18)).toBe(true);
      expect(isStaleNoRawOnAltVote(30)).toBe(true);
      expect(isStaleNoRawOnAltVote(45)).toBe(false);
      expect(isStaleNoRawOnAltVote(60)).toBe(false);
    });

    it("ties second A1 to existing holder at 60 not newcomer No raw 18", () => {
      const entryIds = ["Comp10", "Comp11", "A"];
      const votes = new Map<string, CallbackVote>([
        ["Comp10", "no"],
        ["Comp11", "alt1"],
        ["A", "yes"],
      ]);
      const raw = new Map<string, number | null>([
        ["Comp10", 18],
        ["Comp11", 60],
        ["A", 100],
      ]);

      const next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "Comp10",
        "alt1",
        { callbackCount: 1, alternateCount: 1 },
        new Set(["Comp10"])
      );

      expect(next.votes.get("Comp10")).toBe("alt1");
      expect(next.votes.get("Comp11")).toBe("alt1");
      expect(next.rawById.get("Comp11")).toBe(60);
      expect(next.rawById.get("Comp10")).toBe(60);
    });

    it("ties second alt2 to incumbent at 59 not newcomer No raw 18", () => {
      const entryIds = ["Comp10", "Comp11", "A"];
      const votes = new Map<string, CallbackVote>([
        ["Comp10", "no"],
        ["Comp11", "alt2"],
        ["A", "yes"],
      ]);
      const raw = new Map<string, number | null>([
        ["Comp10", 18],
        ["Comp11", 59],
        ["A", 100],
      ]);

      const next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "Comp10",
        "alt2",
        { callbackCount: 1, alternateCount: 2 },
        new Set(["Comp10"])
      );

      expect(next.votes.get("Comp10")).toBe("alt2");
      expect(next.votes.get("Comp11")).toBe("alt2");
      expect(next.rawById.get("Comp11")).toBe(59);
      expect(next.rawById.get("Comp10")).toBe(59);
    });

    it("ties second alt2 to incumbent when newcomer has valid high leftover raw", () => {
      const entryIds = ["Comp10", "Comp11", "A"];
      const votes = new Map<string, CallbackVote>([
        ["Comp10", "no"],
        ["Comp11", "alt2"],
        ["A", "yes"],
      ]);
      const raw = new Map<string, number | null>([
        ["Comp10", 58],
        ["Comp11", 59],
        ["A", 100],
      ]);

      const next = applyCallbackVote(
        entryIds,
        votes,
        raw,
        "Comp10",
        "alt2",
        { callbackCount: 1, alternateCount: 2 },
        new Set(["Comp10"])
      );

      expect(next.rawById.get("Comp11")).toBe(59);
      expect(next.rawById.get("Comp10")).toBe(59);
    });
  });
});
