import { describe, expect, it } from "vitest";
import {
  buildManualPairs,
  computeRotatedPairs,
  pairingsReady,
  randomRotationOffset,
  resolveFinalsPairs,
  validateManualPairings,
} from "./finalsPairing";

describe("computeRotatedPairs", () => {
  const leads = [1, 2, 3, 4, 5].map((bib) => ({
    id: `l${bib}`,
    bibNumber: 100 + bib,
    role: "lead" as const,
  }));
  const follows = [1, 2, 3, 4, 5].map((bib) => ({
    id: `f${bib}`,
    bibNumber: 200 + bib,
    role: "follow" as const,
  }));

  it("rotates follows by offset (rotation 4, N=5)", () => {
    const pairs = computeRotatedPairs(leads, follows, 4);
    expect(pairs).toHaveLength(5);
    // Lead bib 101 (index 0) → follow bib 205 (index 4, 5th follow)
    expect(pairs[0].lead.bibNumber).toBe(101);
    expect(pairs[0].follow.bibNumber).toBe(205);
    // 4th-to-last lead (index 1, bib 102) → 1st follow (201)
    expect(pairs[1].follow.bibNumber).toBe(201);
    expect(pairs[4].follow.bibNumber).toBe(204);
  });

  it("rejects invalid rotation", () => {
    expect(() => computeRotatedPairs(leads, follows, 0)).toThrow();
    expect(() => computeRotatedPairs(leads, follows, 5)).toThrow();
  });
});

describe("randomRotationOffset", () => {
  it("returns value in 1..N-1", () => {
    for (let i = 0; i < 20; i++) {
      const r = randomRotationOffset(10);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(9);
    }
  });
});

describe("validateManualPairings", () => {
  const leads = [1, 2, 3].map((n) => ({
    id: `l${n}`,
    bibNumber: 100 + n,
    role: "lead" as const,
  }));
  const follows = [1, 2, 3].map((n) => ({
    id: `f${n}`,
    bibNumber: 200 + n,
    role: "follow" as const,
  }));

  it("requires a bijection between leads and follows", () => {
    expect(
      validateManualPairings(leads, follows, [
        { lead_round_entry_id: "l1", follow_round_entry_id: "f2" },
        { lead_round_entry_id: "l2", follow_round_entry_id: "f1" },
        { lead_round_entry_id: "l3", follow_round_entry_id: "f3" },
      ]).ok
    ).toBe(true);

    expect(
      validateManualPairings(leads, follows, [
        { lead_round_entry_id: "l1", follow_round_entry_id: "f1" },
        { lead_round_entry_id: "l1", follow_round_entry_id: "f2" },
        { lead_round_entry_id: "l3", follow_round_entry_id: "f3" },
      ]).ok
    ).toBe(false);
  });
});

describe("resolveFinalsPairs", () => {
  const leads = [1, 2].map((n) => ({
    id: `l${n}`,
    bibNumber: 100 + n,
    role: "lead" as const,
  }));
  const follows = [1, 2].map((n) => ({
    id: `f${n}`,
    bibNumber: 200 + n,
    role: "follow" as const,
  }));

  it("uses rotation when mode is rotation", () => {
    const pairs = resolveFinalsPairs(leads, follows, {
      pairing_mode: "rotation",
      rotation_offset: 1,
      manual_pairings: null,
    });
    expect(pairs[0].follow.id).toBe("f2");
  });

  it("uses manual mapping when mode is manual", () => {
    const pairs = resolveFinalsPairs(leads, follows, {
      pairing_mode: "manual",
      rotation_offset: null,
      manual_pairings: [
        { lead_round_entry_id: "l1", follow_round_entry_id: "f1" },
        { lead_round_entry_id: "l2", follow_round_entry_id: "f2" },
      ],
    });
    expect(buildManualPairs(leads, follows, pairs.map((p) => ({
      lead_round_entry_id: p.lead.id,
      follow_round_entry_id: p.follow.id,
    })))).toHaveLength(2);
    expect(pairs[0].follow.id).toBe("f1");
  });
});

describe("pairingsReady", () => {
  it("checks rotation or manual state", () => {
    expect(
      pairingsReady({
        pairing_mode: "rotation",
        rotation_offset: 2,
        manual_pairings: null,
      })
    ).toBe(true);
    expect(
      pairingsReady({
        pairing_mode: "manual",
        rotation_offset: null,
        manual_pairings: [
          { lead_round_entry_id: "l1", follow_round_entry_id: "f1" },
        ],
      })
    ).toBe(true);
    expect(
      pairingsReady({
        pairing_mode: "manual",
        rotation_offset: null,
        manual_pairings: null,
      })
    ).toBe(false);
  });
});
