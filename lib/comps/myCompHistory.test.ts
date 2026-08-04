import { describe, expect, it } from "vitest";
import {
  buildCompHistoryRows,
  isPastEvent,
  sortCompHistory,
} from "@/lib/comps/myCompHistory";

describe("buildCompHistoryRows", () => {
  const entries = [
    {
      competitionId: "c1",
      competitionName: "Novice J&J",
      compType: "jack_and_jill",
      eventTitle: "Spring Comp",
      eventStartsAt: "2026-01-01T00:00:00Z",
      entryId: "e1",
      role: "lead" as const,
    },
    {
      competitionId: "c1",
      competitionName: "Novice J&J",
      compType: "jack_and_jill",
      eventTitle: "Spring Comp",
      eventStartsAt: "2026-01-01T00:00:00Z",
      entryId: "e1-finals",
      role: "lead" as const,
    },
    {
      competitionId: "c2",
      competitionName: "Strictly",
      compType: "strictly",
      eventTitle: "Spring Comp",
      eventStartsAt: "2026-02-01T00:00:00Z",
      entryId: "e2",
      role: "follow" as const,
    },
  ];

  it("dedupes by competition and role", () => {
    const rows = buildCompHistoryRows(
      entries,
      new Map(),
      [],
      () => null
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.competitionId).sort()).toEqual(["c1", "c2"]);
  });

  it("resolves placement from published finals", () => {
    const finalsByComp = new Map([
      [
        "c2",
        {
          roundId: "r2",
          tabulation: { mode: "relative_placement", grid: [], entries: [] },
        },
      ],
    ]);
    const roundEntries = [
      { roundEntryId: "re2", roundId: "r2", entryId: "e2" },
    ];
    const rows = buildCompHistoryRows(
      entries,
      finalsByComp,
      roundEntries,
      () => 2
    );
    const strictly = rows.find((r) => r.competitionId === "c2");
    expect(strictly?.placement).toBe(2);
    const jnj = rows.find((r) => r.competitionId === "c1");
    expect(jnj?.placement).toBeNull();
  });
});

describe("sortCompHistory", () => {
  it("sorts newest event first", () => {
    const sorted = sortCompHistory([
      {
        competitionId: "a",
        competitionName: "A",
        compType: "strictly",
        eventTitle: null,
        eventStartsAt: "2025-01-01T00:00:00Z",
        placement: null,
        role: null,
      },
      {
        competitionId: "b",
        competitionName: "B",
        compType: "strictly",
        eventTitle: null,
        eventStartsAt: "2026-01-01T00:00:00Z",
        placement: 1,
        role: "lead",
      },
    ]);
    expect(sorted[0].competitionId).toBe("b");
  });
});

describe("isPastEvent", () => {
  it("returns true when event start is before now", () => {
    expect(
      isPastEvent("2020-01-01T00:00:00Z", "2026-01-01T00:00:00Z")
    ).toBe(true);
    expect(
      isPastEvent("2030-01-01T00:00:00Z", "2026-01-01T00:00:00Z")
    ).toBe(false);
  });
});
