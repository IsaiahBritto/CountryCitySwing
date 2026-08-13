import { describe, expect, it } from "vitest";
import {
  applyRawChange,
  canOpenVerify,
  finalizeAllRankings,
  fitRawInSlot,
  reorderMovedEntry,
  reseedAllRawFromOrdinals,
  respreadRawScores,
  seedRawFromRankOrder,
  tiedEntryIds,
  toOrdinals,
} from "@/lib/scoring/finalsSync";

const item = (
  entryId: string,
  ordinal: number | null,
  raw: number | null
) => ({ entryId, ordinal, raw });

describe("finalsSync", () => {
  it("seeds raw from rank order 100 to 20", () => {
    expect([...seedRawFromRankOrder(["A", "B", "C", "D", "E"]).values()]).toEqual(
      [100, 80, 60, 40, 20]
    );
  });

  it("applyRawChange only ranks entries with raw", () => {
    const items = [item("A", null, null), item("B", null, null)];
    const next = applyRawChange(items, "A", 85);
    expect(next.find((i) => i.entryId === "A")).toEqual({
      entryId: "A",
      ordinal: 1,
      raw: 85,
    });
    expect(next.find((i) => i.entryId === "B")?.ordinal).toBeNull();
    expect(next.find((i) => i.entryId === "B")?.raw).toBeNull();
  });

  it("finalizeAllRankings requires all scored with no ties", () => {
    const partial = [item("A", 1, 100), item("B", null, null)];
    expect(finalizeAllRankings(partial)).toBeNull();
    expect(canOpenVerify(partial)).toBe(false);

    const tied = [item("A", 1, 80), item("B", 2, 80)];
    expect(finalizeAllRankings(tied)).toBeNull();

    const ok = [item("A", null, 100), item("B", null, 80), item("C", null, 60)];
    const finalized = finalizeAllRankings(ok);
    expect(finalized).not.toBeNull();
    expect(finalized!.find((i) => i.entryId === "B")?.ordinal).toBe(2);
  });

  describe("reorderMovedEntry", () => {
    it("regression: move 4th to 3rd adjusts only the moved couple (screenshot scores)", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 97.8),
        item("C", 3, 95.6),
        item("D", 4, 73.3),
        item("E", 5, 64.4),
      ];
      const next = reorderMovedEntry(items, "D", "C");
      expect(next.find((i) => i.entryId === "D")?.ordinal).toBe(3);
      expect(next.find((i) => i.entryId === "D")?.raw).toBe(96.7);
      expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(4);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(95.6);
      expect(next.find((i) => i.entryId === "A")?.raw).toBe(100);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(97.8);
      expect(next.find((i) => i.entryId === "E")?.raw).toBe(64.4);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move 3rd up to 2nd adjusts only the moved entry", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 20),
      ];
      const next = reorderMovedEntry(items, "C", "B");
      expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(2);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(90);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(80);
      expect(next.find((i) => i.entryId === "A")?.raw).toBe(100);
      expect(next.find((i) => i.entryId === "D")?.raw).toBe(20);
    });

    it("move 2nd down to 3rd adjusts only the moved entry", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 20),
      ];
      const next = reorderMovedEntry(items, "B", "C");
      expect(next.find((i) => i.entryId === "B")?.ordinal).toBe(3);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(40);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(60);
      expect(next.find((i) => i.entryId === "A")?.raw).toBe(100);
      expect(next.find((i) => i.entryId === "D")?.raw).toBe(20);
    });

    it("move to 1st uses ceiling and nudges below neighbor if tied", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 99.9),
        item("C", 3, 60),
      ];
      const next = reorderMovedEntry(items, "B", "A");
      expect(next.find((i) => i.entryId === "B")?.ordinal).toBe(1);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(100);
      expect(next.find((i) => i.entryId === "A")?.raw).toBe(99.9);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move to 2nd adjusts only the moved entry", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
      ];
      const next = reorderMovedEntry(items, "C", "B");
      expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(2);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(90);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(80);
    });

    it("move to last place stays below neighbor above", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 40),
        item("E", 5, 30),
        item("F", 6, 25),
        item("G", 7, 22),
        item("H", 8, 37.8),
        item("I", 9, 20),
        item("J", 10, 64.4),
      ];
      const next = reorderMovedEntry(items, "I", "J");
      expect(next.find((i) => i.entryId === "I")?.ordinal).toBe(10);
      expect(next.find((i) => i.entryId === "I")?.raw).toBeLessThan(64.4);
      expect(next.find((i) => i.entryId === "I")?.raw).toBeGreaterThanOrEqual(0.1);
      expect(next.find((i) => i.entryId === "J")?.raw).toBe(64.4);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move to last place fits below neighbor without nudging (screenshot case)", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 40),
        item("E", 5, 30),
        item("F", 6, 25),
        item("G", 7, 22),
        item("H", 8, 37.8),
        item("I", 9, 20),
        item("J", 10, 64.4),
      ];
      const next = reorderMovedEntry(items, "H", "J");
      expect(next.find((i) => i.entryId === "H")?.ordinal).toBe(10);
      expect(next.find((i) => i.entryId === "H")?.raw).toBe(19.9);
      expect(next.find((i) => i.entryId === "I")?.raw).toBe(20);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move to last place nudges above when gap is tighter than 0.1", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 50),
        item("C", 3, 0.15),
      ];
      const next = reorderMovedEntry(items, "B", "C");
      expect(next.find((i) => i.entryId === "B")?.ordinal).toBe(3);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(0.1);
      expect(next.find((i) => i.entryId === "B")?.raw).toBeLessThan(
        next.find((i) => i.entryId === "C")?.raw!
      );
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(0.15);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("fitRawInSlot last rank never scores above neighbor", () => {
      const snapshot = new Map([
        ["above", 20],
        ["other", 64.4],
      ]);
      const result = fitRawInSlot(20, 20, null, snapshot, "moved");
      expect(result.raw).toBe(19.9);
      expect(result.nudgeAbove).toBeUndefined();
    });

    it("non-adjacent move adjusts only the moved entry", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 20),
      ];
      const next = reorderMovedEntry(items, "D", "B");
      expect(next.find((i) => i.entryId === "D")?.ordinal).toBe(2);
      // mid(100, 60) = 80, but B still holds 80 at rank 4 — avoid tie
      expect(next.find((i) => i.entryId === "D")?.raw).toBe(79.9);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(80);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(60);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("fitRawInSlot nudges below neighbor when gap is too tight", () => {
      const snapshot = new Map([
        ["A", 100],
        ["B", 100],
        ["C", 99.9],
      ]);
      const result = fitRawInSlot(100, 100, 99.9, snapshot, "moved");
      expect(result.nudgeBelow).toBe(99.8);
      expect(result.raw).toBeLessThan(100);
      expect(result.raw).toBeGreaterThan(99.8);
    });
  });

  it("raw edits re-sort ordinals, with the edited entry winning ties", () => {
    const items = [
      item("A", 1, 100),
      item("B", 2, 80),
      item("C", 3, 60),
    ];
    const next = applyRawChange(items, "C", 80);
    expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(2);
    expect(tiedEntryIds(next).sort()).toEqual(["B", "C"]);
  });

  it("reseedAllRawFromOrdinals updates every ranked entry", () => {
    const items = [
      item("A", 1, 50),
      item("B", 2, 40),
      item("C", 3, 30),
    ];
    const next = reseedAllRawFromOrdinals(items);
    expect(next.map((i) => i.raw)).toEqual([100, 60, 20]);
  });

  it("toOrdinals only includes explicitly ranked entries", () => {
    const items = [item("A", 1, 100), item("B", null, null)];
    expect(toOrdinals(items)).toEqual({ A: 1 });
  });

  describe("respreadRawScores", () => {
    it("spreads five scored entries from 100 to 20", () => {
      const raw = new Map<string, number | null>(
        ["A", "B", "C", "D", "E"].map((id) => [id, 99.9])
      );
      const next = respreadRawScores(["A", "B", "C", "D", "E"], raw, {
        floor: 20,
      });
      expect([...next.values()]).toEqual([100, 80, 60, 40, 20]);
    });
  });
});
