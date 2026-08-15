import { describe, expect, it } from "vitest";
import { scoreCallbacks, type CallbackInput } from "@/lib/scoring/callbacks";

describe("callback cut line adjustment", () => {
  const baseInput: CallbackInput = {
    judgeIds: ["J1", "J2", "J3"],
    entryIds: ["A", "B", "C", "D", "E"],
    callbackCount: 2,
    alternateCount: 1,
    votes: {
      J1: { A: "yes", B: "yes", C: "alt1", D: "no", E: "no" },
      J2: { A: "yes", B: "alt1", C: "yes", D: "alt2", E: "no" },
      J3: { A: "yes", B: "yes", C: "no", D: "alt1", E: "alt2" },
    },
  };

  it("changes who advances when callback count changes without ties", () => {
    const top2 = scoreCallbacks({ ...baseInput, callbackCount: 2, alternateCount: 0 });
    expect(top2.unresolvedTies).toHaveLength(0);
    expect(top2.ranked.filter((r) => r.advanced).map((r) => r.entryId)).toEqual([
      "A",
      "B",
    ]);

    const top3 = scoreCallbacks({ ...baseInput, callbackCount: 3, alternateCount: 0 });
    expect(top3.unresolvedTies).toHaveLength(0);
    expect(top3.ranked.filter((r) => r.advanced).map((r) => r.entryId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("updates alternate ranks when alternate count changes", () => {
    const oneAlternate = scoreCallbacks({
      ...baseInput,
      callbackCount: 2,
      alternateCount: 1,
    });
    expect(oneAlternate.unresolvedTies).toHaveLength(0);
    expect(
      oneAlternate.ranked
        .filter((r) => r.alternateRank != null)
        .map((r) => r.entryId)
    ).toEqual(["C"]);

    const twoAlternates = scoreCallbacks({
      ...baseInput,
      callbackCount: 2,
      alternateCount: 2,
    });
    expect(twoAlternates.unresolvedTies).toHaveLength(0);
    expect(
      twoAlternates.ranked
        .filter((r) => r.alternateRank != null)
        .map((r) => ({ id: r.entryId, alt: r.alternateRank }))
    ).toEqual([
      { id: "C", alt: 1 },
      { id: "D", alt: 2 },
    ]);
  });
});
