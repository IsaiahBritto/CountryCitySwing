import { describe, expect, it } from "vitest";
import {
  applyRawChange,
  canOpenVerify,
  finalizeAllRankings,
  reorderRankedAndSeedAll,
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

  it("reorderRankedAndSeedAll swaps and reseeds all raw scores", () => {
    const items = [
      item("A", 1, 100),
      item("B", 2, 73.3),
      item("C", 3, 46.7),
      item("D", 4, 20),
    ];
    const next = reorderRankedAndSeedAll(items, "B", "A");
    expect(next.find((i) => i.entryId === "B")?.ordinal).toBe(1);
    expect(next.find((i) => i.entryId === "A")?.ordinal).toBe(2);
    expect(next.find((i) => i.entryId === "B")?.raw).toBe(100);
    expect(next.find((i) => i.entryId === "D")?.raw).toBe(20);
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
