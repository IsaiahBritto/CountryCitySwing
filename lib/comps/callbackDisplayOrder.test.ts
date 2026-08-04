import { describe, expect, it } from "vitest";
import { orderCallbackRowsForDisplay } from "./callbackDisplayOrder";

const entries = [
  { roundEntryId: "a", bibNumber: 12 },
  { roundEntryId: "b", bibNumber: 3 },
  { roundEntryId: "c", bibNumber: 7 },
  { roundEntryId: "d", bibNumber: 1 },
  { roundEntryId: "e", bibNumber: 9 },
];

const ranked = [
  { roundEntryId: "a", advanced: true, alternateRank: null, rank: 1 },
  { roundEntryId: "b", advanced: true, alternateRank: null, rank: 2 },
  { roundEntryId: "c", advanced: false, alternateRank: 2, rank: 3 },
  { roundEntryId: "d", advanced: false, alternateRank: 1, rank: 4 },
  { roundEntryId: "e", advanced: false, alternateRank: null, rank: 5 },
];

describe("orderCallbackRowsForDisplay", () => {
  it("keeps placement order when comp is closed", () => {
    expect(
      orderCallbackRowsForDisplay(ranked, entries, true).map(
        (r) => r.roundEntryId
      )
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("groups advancers, alternates, and rest by bib before close", () => {
    expect(
      orderCallbackRowsForDisplay(ranked, entries, false).map(
        (r) => r.roundEntryId
      )
    ).toEqual([
      "b", // advancer bib 3
      "a", // advancer bib 12
      "d", // alt 1 bib 1
      "c", // alt 2 bib 7
      "e", // non-advancer bib 9
    ]);
  });
});
