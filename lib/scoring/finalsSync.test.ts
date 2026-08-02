import { describe, expect, it } from "vitest";
import {
  applyRawChange,
  applyReorder,
  seedRawFromPlacements,
  tiedEntryIds,
  toOrdinals,
} from "@/lib/scoring/finalsSync";

describe("finalsSync", () => {
  it("seeds raw scores from placements at 100 descending by 0.1", () => {
    expect(seedRawFromPlacements(["A", "B", "C"])).toEqual([
      { entryId: "A", raw: 100 },
      { entryId: "B", raw: 99.9 },
      { entryId: "C", raw: 99.8 },
    ]);
  });

  it("inherit-and-nudge: dragging to 1st takes 100 and bumps the old 1st to 99.9", () => {
    // The agreed example: bib 23 holds 100 in 1st; bib 45 is dragged to 1st.
    const items = [
      { entryId: "bib23", raw: 100 },
      { entryId: "bib7", raw: 99.5 },
      { entryId: "bib45", raw: 99.0 },
    ];
    expect(applyReorder(items, 2, 0)).toEqual([
      { entryId: "bib45", raw: 100 },
      { entryId: "bib23", raw: 99.9 },
      { entryId: "bib7", raw: 99.5 },
    ]);
  });

  it("only cascades as far as needed", () => {
    const items = [
      { entryId: "A", raw: 100 },
      { entryId: "B", raw: 99.9 },
      { entryId: "C", raw: 95 },
      { entryId: "D", raw: 90 },
    ];
    // Drag D to 2nd: D inherits 99.9, B drops to 99.8, C at 95 is untouched.
    expect(applyReorder(items, 3, 1)).toEqual([
      { entryId: "A", raw: 100 },
      { entryId: "D", raw: 99.9 },
      { entryId: "B", raw: 99.8 },
      { entryId: "C", raw: 95 },
    ]);
  });

  it("keeps unique descending order when dragging down the list", () => {
    const items = [
      { entryId: "A", raw: 100 },
      { entryId: "B", raw: 99.9 },
      { entryId: "C", raw: 99.0 },
    ];
    const next = applyReorder(items, 0, 2);
    expect(next.map((i) => i.entryId)).toEqual(["B", "C", "A"]);
    for (let i = 1; i < next.length; i++) {
      expect(next[i].raw).toBeLessThan(next[i - 1].raw);
    }
  });

  it("raw edits re-sort placements, with the edited entry winning ties", () => {
    const items = [
      { entryId: "A", raw: 100 },
      { entryId: "B", raw: 99.9 },
      { entryId: "C", raw: 99.0 },
    ];
    const next = applyRawChange(items, "C", 99.9);
    expect(next.map((i) => i.entryId)).toEqual(["A", "C", "B"]);
    expect(tiedEntryIds(next).sort()).toEqual(["B", "C"]);
  });

  it("clamps and rounds raw edits to one decimal within 0-100", () => {
    const items = [
      { entryId: "A", raw: 100 },
      { entryId: "B", raw: 50 },
    ];
    expect(applyRawChange(items, "B", 100.7)[0]).toEqual({
      entryId: "B",
      raw: 100,
    });
    expect(applyRawChange(items, "B", 42.349)[1]).toEqual({
      entryId: "B",
      raw: 42.3,
    });
    expect(applyRawChange(items, "B", -3)[1]).toEqual({ entryId: "B", raw: 0 });
  });

  it("reports no ties on a clean sheet and converts to ordinals", () => {
    const items = seedRawFromPlacements(["X", "Y", "Z"]);
    expect(tiedEntryIds(items)).toEqual([]);
    expect(toOrdinals(items)).toEqual({ X: 1, Y: 2, Z: 3 });
  });

  it("ignores out-of-range reorders", () => {
    const items = seedRawFromPlacements(["A", "B"]);
    expect(applyReorder(items, 0, 0)).toBe(items);
    expect(applyReorder(items, 0, 5)).toBe(items);
  });
});
