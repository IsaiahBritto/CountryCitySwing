import { describe, expect, it } from "vitest";
import {
  applyRawChange,
  canOpenVerify,
  finalizeAllRankings,
  fitRawInSlot,
  moveEntryToRank,
  reseedAllRawFromOrdinals,
  respreadRawScores,
  seedRawFromRankOrder,
  tiedEntryIds,
  finalsTiedWithBibsByEntryId,
  toOrdinals,
} from "@/lib/scoring/finalsSync";

const item = (
  entryId: string,
  ordinal: number | null,
  raw: number | null
) => ({ entryId, ordinal, raw });

function expectOnlyMovedRawChanged(
  before: ReturnType<typeof item>[],
  after: ReturnType<typeof item>[],
  movedEntryId: string
) {
  for (const row of before) {
    if (row.entryId === movedEntryId) continue;
    expect(after.find((i) => i.entryId === row.entryId)?.raw).toBe(row.raw);
  }
}

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

  describe("moveEntryToRank", () => {
    it("moves 4th to 2nd with midpoint 85; only D raw changes", () => {
      const items = [
        item("A", 1, 90),
        item("B", 2, 80),
        item("C", 3, 70),
        item("D", 4, 60),
      ];
      const next = moveEntryToRank(items, "D", 2);
      expect(next.find((i) => i.entryId === "A")).toMatchObject({
        ordinal: 1,
        raw: 90,
      });
      expect(next.find((i) => i.entryId === "D")).toMatchObject({
        ordinal: 2,
        raw: 85,
      });
      expect(next.find((i) => i.entryId === "B")).toMatchObject({
        ordinal: 3,
        raw: 80,
      });
      expect(next.find((i) => i.entryId === "C")).toMatchObject({
        ordinal: 4,
        raw: 70,
      });
      expectOnlyMovedRawChanged(items, next, "D");
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move 3rd up to 2nd uses midpoint of neighbors above and below", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 20),
      ];
      const next = moveEntryToRank(items, "C", 2);
      expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(2);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(90);
      expectOnlyMovedRawChanged(items, next, "C");
    });

    it("move 2nd to 3rd uses midpoint between 70 and 60", () => {
      const items = [
        item("A", 1, 90),
        item("B", 2, 80),
        item("C", 3, 70),
        item("D", 4, 60),
      ];
      const next = moveEntryToRank(items, "B", 3);
      expect(next.find((i) => i.entryId === "B")?.ordinal).toBe(3);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(65);
      expectOnlyMovedRawChanged(items, next, "B");
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move to last uses midpoint of neighbor above and 0.1", () => {
      const items = [
        item("A", 1, 90),
        item("B", 2, 80),
        item("C", 3, 70),
        item("D", 4, 60),
      ];
      const next = moveEntryToRank(items, "B", 4);
      expect(next.find((i) => i.entryId === "B")?.ordinal).toBe(4);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(30.1);
      expectOnlyMovedRawChanged(items, next, "B");
    });

    it("move to 1st uses midpoint of 100 and below neighbor", () => {
      const items = [
        item("A", 1, 90),
        item("B", 2, 80),
        item("C", 3, 60),
      ];
      const next = moveEntryToRank(items, "C", 1);
      expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(1);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(95);
      expectOnlyMovedRawChanged(items, next, "C");
    });

    it("move to 1st above 100 nudges former leader to 99.9", () => {
      const items = [
        item("two", 1, 100),
        item("nine", 2, 85),
      ];
      const next = moveEntryToRank(items, "nine", 1);
      expect(next.find((i) => i.entryId === "nine")).toMatchObject({
        ordinal: 1,
        raw: 100,
      });
      expect(next.find((i) => i.entryId === "two")?.raw).toBe(99.9);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move to last below 0.1 nudges neighbor up", () => {
      const items = [
        item("A", 1, 50),
        item("B", 2, 30),
        item("C", 3, 0.1),
      ];
      const next = moveEntryToRank(items, "A", 3);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(0.2);
      expect(next.find((i) => i.entryId === "A")).toMatchObject({
        ordinal: 3,
        raw: 0.1,
      });
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("move to last uses midpoint of above and 0.1", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 60),
        item("D", 4, 40),
      ];
      const next = moveEntryToRank(items, "A", 4);
      expect(next.find((i) => i.entryId === "A")?.ordinal).toBe(4);
      expect(next.find((i) => i.entryId === "A")?.raw).toBe(20.1);
      expectOnlyMovedRawChanged(items, next, "A");
    });

    it("wide neighbor gap keeps unique raw without ties", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 80),
        item("C", 3, 80.1),
      ];
      const next = moveEntryToRank(items, "C", 2);
      expect(next.find((i) => i.entryId === "C")?.ordinal).toBe(2);
      expect(next.find((i) => i.entryId === "C")?.raw).toBeGreaterThan(80);
      expect(next.find((i) => i.entryId === "C")?.raw).toBeLessThan(100);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(80);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("0.1 neighbor gap nudges below neighbor and midpoints moved entry", () => {
      const items = [
        item("A", 1, 100),
        item("B", 2, 91.1),
        item("C", 3, 91.0),
        item("D", 4, 89.4),
      ];
      const next = moveEntryToRank(items, "D", 3);
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(91.1);
      expect(next.find((i) => i.entryId === "D")).toMatchObject({
        ordinal: 3,
        raw: 91.0,
      });
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(90.9);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("steps below nudge further when 90.9 is already taken", () => {
      const items = [
        item("A", 1, 92),
        item("B", 2, 91.1),
        item("C", 3, 91.0),
        item("E", 4, 90.9),
        item("D", 5, 89.4),
      ];
      const next = moveEntryToRank(items, "D", 3);
      expect(next.find((i) => i.entryId === "C")?.raw).toBe(90.8);
      expect(next.find((i) => i.entryId === "D")?.raw).toBe(91.0);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("nudges above when below neighbor cannot move down", () => {
      const items = [
        item("A", 1, 0.3),
        item("B", 2, 0.2),
        item("C", 3, 0.1),
        item("D", 4, 0.05),
      ];
      const next = moveEntryToRank(items, "D", 2);
      expect(next.find((i) => i.entryId === "A")?.raw).toBe(0.4);
      expect(next.find((i) => i.entryId === "D")).toMatchObject({
        ordinal: 2,
        raw: 0.3,
      });
      expect(next.find((i) => i.entryId === "B")?.raw).toBe(0.2);
      expect(tiedEntryIds(next)).toEqual([]);
    });

    it("no-op when target rank equals current rank", () => {
      const items = [item("A", 1, 90), item("B", 2, 80)];
      const next = moveEntryToRank(items, "B", 2);
      expect(next).toEqual(items);
    });
  });

  describe("fitRawInSlot (legacy helper)", () => {
    it("last rank never scores above neighbor", () => {
      const snapshot = new Map([
        ["above", 20],
        ["other", 64.4],
      ]);
      const result = fitRawInSlot(20, 20, null, snapshot, "moved");
      expect(result.raw).toBe(19.9);
      expect(result.nudgeAbove).toBeUndefined();
    });

    it("may nudge below neighbor when gap is too tight", () => {
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

  describe("finalsTiedWithBibsByEntryId", () => {
    it("maps each tied entry to peer bib numbers", () => {
      const items = [
        item("A", 1, 80),
        item("B", 2, 80),
        item("C", 3, 60),
      ];
      const bibById = new Map<string, number | null>([
        ["A", 10],
        ["B", 20],
        ["C", 30],
      ]);
      const map = finalsTiedWithBibsByEntryId(items, bibById);
      expect(map.get("A")).toEqual([20]);
      expect(map.get("B")).toEqual([10]);
      expect(map.has("C")).toBe(false);
    });

    it("returns empty map when no duplicate raws", () => {
      const items = [item("A", 1, 80), item("B", 2, 70)];
      const bibById = new Map<string, number | null>([
        ["A", 1],
        ["B", 2],
      ]);
      expect(finalsTiedWithBibsByEntryId(items, bibById).size).toBe(0);
    });
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
