import { describe, expect, it } from "vitest";
import {
  computeRotatedPairs,
  randomRotationOffset,
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
