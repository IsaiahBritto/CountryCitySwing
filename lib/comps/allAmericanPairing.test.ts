import { describe, expect, it } from "vitest";
import {
  computeAllAmericanRotatedPairs,
  randomAllAmericanRotationOffset,
  validateAllAmericanManualPairings,
} from "./allAmericanPairing";

describe("computeAllAmericanRotatedPairs", () => {
  const L = (b: number) => ({
    id: `l${b}`,
    bibNumber: 100 + b,
    role: "lead" as const,
  });
  const F = (b: number) => ({
    id: `f${b}`,
    bibNumber: 200 + b,
    role: "follow" as const,
  });

  it("balances L=F with second lead partnership using follow primary bib", () => {
    const leads = [L(1), L(2), L(3)];
    const follows = [F(1), F(2), F(3)];
    const pairs = computeAllAmericanRotatedPairs(leads, follows, 1);
    expect(pairs).toHaveLength(3);
    const l1 = pairs.filter((p) => p.lead.id === "l1");
    expect(l1.length).toBe(1);
    expect(l1[0].judgePrimaryBib).toBe("lead");
  });

  it("when F > L, second partnership for same lead uses follow primary bib", () => {
    const leads = [L(1), L(2)];
    const follows = [F(1), F(2), F(3)];
    const pairs = computeAllAmericanRotatedPairs(leads, follows, 0);
    expect(pairs).toHaveLength(3);
    const repeat = pairs.find((p) => p.judgePrimaryBib === "follow");
    expect(repeat).toBeDefined();
  });

  it("rejects invalid rotation for F>1", () => {
    const leads = [L(1)];
    const follows = [F(1), F(2), F(3)];
    expect(() =>
      computeAllAmericanRotatedPairs(leads, follows, 99)
    ).toThrow();
  });
});

describe("randomAllAmericanRotationOffset", () => {
  it("returns 0..F-1 when F>1", () => {
    for (let i = 0; i < 15; i++) {
      const r = randomAllAmericanRotationOffset(3, 5);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(4);
    }
  });
});

describe("validateAllAmericanManualPairings", () => {
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

  it("requires max(L,F) rows", () => {
    const v = validateAllAmericanManualPairings(leads, follows, [
      { lead_round_entry_id: "l1", follow_round_entry_id: "f1" },
    ]);
    expect(v.ok).toBe(false);
  });
});
