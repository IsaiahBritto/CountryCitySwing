import { describe, expect, it } from "vitest";
import { sortRoundEntriesByBib } from "./entrySort";

describe("sortRoundEntriesByBib", () => {
  it("sorts by bib ascending with nulls last", () => {
    const entries = [
      { id: "c", dance_order: 1, display: { bibNumber: 102 } },
      { id: "a", dance_order: 2, display: { bibNumber: 100 } },
      { id: "b", dance_order: 3, display: { bibNumber: null } },
    ];
    const sorted = sortRoundEntriesByBib(entries);
    expect(sorted.map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("tie-breaks on dance order then id", () => {
    const entries = [
      { id: "z", dance_order: 2, display: { bibNumber: 100 } },
      { id: "y", dance_order: 1, display: { bibNumber: 100 } },
    ];
    const sorted = sortRoundEntriesByBib(entries);
    expect(sorted.map((e) => e.id)).toEqual(["y", "z"]);
  });
});
