import { describe, expect, it } from "vitest";
import {
  compressOrdinals,
  pairwisePreference,
  tabulateRelativePlacement,
  RelativePlacementError,
  type RelativePlacementInput,
} from "@/lib/scoring/relativePlacement";

/**
 * The hypothetical contest from the WSDC "Unraveling the Mystery of the
 * Relative Placement Scoring System" document (Jim Tigges): 12 couples,
 * 7 judges plus a chief judge. Ordinals from Figure 2; expected results from
 * Figures 5/7 and the Figure 8A-8C five-judge variants.
 *
 * Couples are keyed by their order of dance ("c1" = Romie & Julie, ...).
 */
const PDF_ORDINALS: Record<string, number[]> = {
  // [J1, J2, J3, J4, J5, J6, J7]
  c1: [5, 12, 6, 12, 9, 12, 10], // Romie & Julie
  c2: [10, 1, 12, 3, 7, 8, 7], // Marc & Cleo
  c3: [4, 7, 7, 9, 6, 3, 5], // George & Gracie
  c4: [2, 3, 5, 1, 1, 2, 2], // Jack & Annie
  c5: [6, 6, 9, 4, 2, 7, 8], // Rhett & Scarlett
  c6: [11, 11, 3, 10, 4, 10, 11], // Rocky & Adrian
  c7: [1, 4, 2, 2, 10, 9, 3], // Fred & Ginger
  c8: [9, 9, 11, 8, 5, 6, 9], // Barney & Betty
  c9: [3, 2, 1, 7, 3, 1, 1], // Ricky & Lucy
  c10: [8, 5, 8, 6, 12, 4, 6], // Ken & Barbie
  c11: [12, 8, 10, 11, 11, 11, 12], // Ike & Mamie
  c12: [7, 10, 4, 5, 8, 5, 4], // Ward & June
};

/** Chief judge ordinals from the Figures 8A-8C tables. */
const PDF_CHIEF_JUDGE: Record<string, number> = {
  c1: 7,
  c2: 5,
  c3: 9,
  c4: 2,
  c5: 6,
  c6: 12,
  c7: 3,
  c8: 10,
  c9: 1,
  c10: 8,
  c11: 11,
  c12: 4,
};

const ENTRY_IDS = Object.keys(PDF_ORDINALS);

function buildInput(judgeIndexes: number[]): RelativePlacementInput {
  const judgeIds = judgeIndexes.map((i) => `J${i + 1}`);
  const ordinals: Record<string, Record<string, number>> = {};
  judgeIndexes.forEach((judgeIndex, k) => {
    const sheet: Record<string, number> = {};
    for (const entryId of ENTRY_IDS) {
      sheet[entryId] = PDF_ORDINALS[entryId][judgeIndex];
    }
    ordinals[judgeIds[k]] = sheet;
  });
  // Each judge's sheet is a full 1..12 permutation regardless of which
  // judges sit on the panel, exactly as in the document's Figure 8 variants.
  return { judgeIds, entryIds: ENTRY_IDS, ordinals };
}

function placementsOf(input: RelativePlacementInput) {
  return tabulateRelativePlacement(input).placements;
}

describe("tabulateRelativePlacement - WSDC document contest (7 judges)", () => {
  const result = tabulateRelativePlacement(buildInput([0, 1, 2, 3, 4, 5, 6]));

  it("uses a majority of 4 for 7 judges", () => {
    expect(result.majority).toBe(4);
  });

  it("produces the exact final results from Figure 7", () => {
    expect(result.placements).toEqual({
      c4: 1, // Jack & Annie (five 1st-2nds)
      c9: 2, // Ricky & Lucy (four 1st-2nds, despite three 1sts)
      c7: 3, // Fred & Ginger (four 1st-3rds)
      c12: 4, // Ward & June (four 1st-5ths)
      c3: 5, // George & Gracie (sum 18, six 1st-7ths)
      c5: 6, // Rhett & Scarlett (sum 18, five 1st-7ths)
      c10: 7, // Ken & Barbie (sum 21)
      c2: 8, // Marc & Cleo
      c8: 9, // Barney & Betty
      c6: 10, // Rocky & Adrian (sum 27)
      c1: 11, // Romie & Julie (sum 30)
      c11: 12, // Ike & Mamie
    });
    expect(result.unresolvedTies).toEqual([]);
  });

  it("records the three-way 1st-6th tie details on the grid", () => {
    const rows = Object.fromEntries(result.grid.map((r) => [r.entryId, r]));
    // George & Gracie and Rhett & Scarlett both sum 18 at level 6 and are
    // separated by their 1st-7th counts (6 vs 5).
    expect(rows.c3.decidedAtLevel).toBe(6);
    expect(rows.c5.decidedAtLevel).toBe(6);
    expect(rows.c10.decidedAtLevel).toBe(6);
    expect(rows.c3.cells[5]).toMatchObject({ count: 4, sum: 18 });
    expect(rows.c5.cells[5]).toMatchObject({ count: 4, sum: 18 });
    expect(rows.c10.cells[5]).toMatchObject({ count: 4, sum: 21 });
    expect(rows.c3.cells[6].count).toBe(6);
    expect(rows.c5.cells[6].count).toBe(5);
    expect(rows.c3.tieBreakNote).toContain("1st-7");
    expect(rows.c10.tieBreakNote).toContain("21");
  });

  it("marks majorities on the grid", () => {
    const c4 = result.grid.find((r) => r.entryId === "c4")!;
    expect(c4.cells[0].majority).toBe(false); // two 1sts
    expect(c4.cells[1].majority).toBe(true); // five 1st-2nds
    expect(c4.cells[1].count).toBe(5);
  });
});

describe("tabulateRelativePlacement - WSDC five-judge variants", () => {
  it("Figure 8A: without judges 4 and 5", () => {
    expect(placementsOf(buildInput([0, 1, 2, 5, 6]))).toEqual({
      c9: 1,
      c4: 2,
      c7: 3,
      c3: 4,
      c12: 5,
      c10: 6,
      c5: 7,
      c2: 8,
      c8: 9,
      c1: 10,
      c6: 11,
      c11: 12,
    });
  });

  it("Figure 8B: without judges 2 and 3", () => {
    expect(placementsOf(buildInput([0, 3, 4, 5, 6]))).toEqual({
      c4: 1,
      c9: 2,
      c7: 3,
      c3: 4,
      c12: 5,
      c5: 6,
      c10: 7,
      c2: 8,
      c8: 9,
      c6: 10,
      c1: 11,
      c11: 12,
    });
  });

  it("Figure 8C: without judges 6 and 7", () => {
    expect(placementsOf(buildInput([0, 1, 2, 3, 4]))).toEqual({
      c4: 1,
      c7: 2,
      c9: 3,
      c5: 4,
      c3: 5,
      c2: 6,
      c12: 7,
      c10: 8,
      c8: 9,
      c1: 10,
      c6: 11,
      c11: 12,
    });
  });
});

describe("head-to-head comparison", () => {
  it("matches the document's Couple A vs Couple B example", () => {
    // A: 1-2-1-2-3-2-1, B: 2-1-3-1-2-1-2. B is preferred by 4 of 7 judges.
    const { aWins, bWins } = pairwisePreference(
      [1, 2, 1, 2, 3, 2, 1],
      [2, 1, 3, 1, 2, 1, 2]
    );
    expect(aWins).toBe(3);
    expect(bWins).toBe(4);
  });

  it("breaks a full tie between two entries by head-to-head majority", () => {
    // The document's Couple A/B example embedded in a real 3-entry contest:
    // A: 1-2-1-2-3-2-1 and B: 2-1-3-1-2-1-2 have identical ordinal multisets
    // (three 1sts, three 2nds, one 3rd), tie on counts and sums at every
    // level, and 4 of 7 judges prefer B.
    const input: RelativePlacementInput = {
      judgeIds: ["J1", "J2", "J3", "J4", "J5", "J6", "J7"],
      entryIds: ["A", "B", "C"],
      ordinals: {
        J1: { A: 1, B: 2, C: 3 },
        J2: { A: 2, B: 1, C: 3 },
        J3: { A: 1, B: 3, C: 2 },
        J4: { A: 2, B: 1, C: 3 },
        J5: { A: 3, B: 2, C: 1 },
        J6: { A: 2, B: 1, C: 3 },
        J7: { A: 1, B: 2, C: 3 },
      },
    };
    const result = tabulateRelativePlacement(input);
    expect(result.placements).toEqual({ B: 1, A: 2, C: 3 });
    expect(result.unresolvedTies).toEqual([]);
    const rowB = result.grid.find((r) => r.entryId === "B")!;
    expect(rowB.tieBreakNote).toContain("head-to-head");
  });
});

describe("unresolvable ties", () => {
  /** Condorcet cycle: A > B > C > A pairwise; all counts/sums identical. */
  const cycleInput: RelativePlacementInput = {
    judgeIds: ["J1", "J2", "J3"],
    entryIds: ["A", "B", "C"],
    ordinals: {
      J1: { A: 1, B: 2, C: 3 },
      J2: { B: 1, C: 2, A: 3 },
      J3: { C: 1, A: 2, B: 3 },
    },
  };

  it("detects a head-to-head preference cycle and reports it unresolved", () => {
    const result = tabulateRelativePlacement(cycleInput);
    expect(result.unresolvedTies).toHaveLength(1);
    expect(result.unresolvedTies[0].reason).toBe("head_to_head_cycle");
    expect([...result.unresolvedTies[0].entryIds].sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(result.unresolvedTies[0].placements).toEqual([1, 2, 3]);
    expect(result.placements.A).toBeNull();
    expect(result.placements.B).toBeNull();
    expect(result.placements.C).toBeNull();
  });

  it("resolves a cycle with the chief judge's ordinals", () => {
    const result = tabulateRelativePlacement({
      ...cycleInput,
      chiefJudgeOrdinals: { A: 2, B: 1, C: 3 },
    });
    expect(result.unresolvedTies).toEqual([]);
    expect(result.placements).toEqual({ B: 1, A: 2, C: 3 });
    const rowB = result.grid.find((r) => r.entryId === "B")!;
    expect(rowB.tieBreakNote).toContain("chief judge");
  });

  it("resolves a cycle with an explicit manual (director) resolution", () => {
    const result = tabulateRelativePlacement({
      ...cycleInput,
      manualTieResolutions: [["C", "A", "B"]],
    });
    expect(result.unresolvedTies).toEqual([]);
    expect(result.placements).toEqual({ C: 1, A: 2, B: 3 });
  });

  it("reports an even-panel head-to-head split as unresolved", () => {
    const result = tabulateRelativePlacement({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B"],
      ordinals: {
        J1: { A: 1, B: 2 },
        J2: { B: 1, A: 2 },
      },
    });
    expect(result.unresolvedTies).toHaveLength(1);
    expect(result.unresolvedTies[0].reason).toBe("head_to_head_tie");
    expect(result.placements.A).toBeNull();
    expect(result.placements.B).toBeNull();
  });
});

describe("scratches and validation", () => {
  it("compresses ordinals after removing scratched entries", () => {
    const compressed = compressOrdinals(
      {
        J1: { A: 1, B: 2, C: 3, D: 4 },
        J2: { A: 4, B: 3, C: 2, D: 1 },
      },
      ["A", "C", "D"]
    );
    expect(compressed).toEqual({
      J1: { A: 1, C: 2, D: 3 },
      J2: { D: 1, C: 2, A: 3 },
    });
  });

  it("compressed scratch sheets tabulate cleanly", () => {
    // Remove c9 (2nd place) from the PDF contest; the rest should tabulate
    // without validation errors and c4 should still win.
    const base = buildInput([0, 1, 2, 3, 4, 5, 6]);
    const active = ENTRY_IDS.filter((e) => e !== "c9");
    const result = tabulateRelativePlacement({
      judgeIds: base.judgeIds,
      entryIds: active,
      ordinals: compressOrdinals(base.ordinals, active),
    });
    expect(result.placements.c4).toBe(1);
    expect(result.unresolvedTies).toEqual([]);
    expect(Object.values(result.placements).sort((a, b) => a! - b!)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1)
    );
  });

  it("rejects duplicate ordinals on a judge sheet", () => {
    expect(() =>
      tabulateRelativePlacement({
        judgeIds: ["J1"],
        entryIds: ["A", "B"],
        ordinals: { J1: { A: 1, B: 1 } },
      })
    ).toThrow(RelativePlacementError);
  });

  it("rejects incomplete sheets", () => {
    expect(() =>
      tabulateRelativePlacement({
        judgeIds: ["J1"],
        entryIds: ["A", "B"],
        ordinals: { J1: { A: 1 } as Record<string, number> },
      })
    ).toThrow(RelativePlacementError);
  });
});

describe("document extreme examples", () => {
  it("a majority of 2nds beats three 1sts (Couple A 2-2-2-2-12-12-12)", () => {
    // Build a 12-entry contest where couple A has 2,2,2,2,12,12,12 and
    // couple B has 1,1,1,3,3,3,3; filler couples take the remaining ordinals.
    const judgeIds = ["J1", "J2", "J3", "J4", "J5", "J6", "J7"];
    const entryIds = ["A", "B", ...Array.from({ length: 10 }, (_, i) => `F${i}`)];
    const aOrds = [2, 2, 2, 2, 12, 12, 12];
    const bOrds = [1, 1, 1, 3, 3, 3, 3];
    const ordinals: Record<string, Record<string, number>> = {};
    judgeIds.forEach((judgeId, j) => {
      const sheet: Record<string, number> = { A: aOrds[j], B: bOrds[j] };
      const used = new Set([aOrds[j], bOrds[j]]);
      let next = 1;
      for (let i = 0; i < 10; i++) {
        while (used.has(next)) next++;
        sheet[`F${i}`] = next;
        used.add(next);
      }
      ordinals[judgeId] = sheet;
    });
    const result = tabulateRelativePlacement({ judgeIds, entryIds, ordinals });
    expect(result.placements.A).toBeLessThan(result.placements.B!);
  });
});
