import { describe, expect, it } from "vitest";
import { aggregateCompetitionResultsFromRounds } from "@/lib/comps/aggregatePublishedResults";

describe("aggregateCompetitionResultsFromRounds", () => {
  const rounds = [
    {
      round_type: "final",
      scoring_mode: "relative_placement",
      published_at: "2026-01-02T00:00:00Z",
      tabulation: {
        mode: "relative_placement",
        entries: [{ entry_id: "e1", display_name: "A" }],
        grid: [[1]],
      },
      competition: {
        id: "c-ccs",
        name: "CCS Strictly",
        comp_type: "strictly",
        test_comp: false,
        event: { id: "ev-ccs", host_kind: "ccs" },
      },
    },
    {
      round_type: "final",
      scoring_mode: "relative_placement",
      published_at: "2026-01-01T00:00:00Z",
      tabulation: { mode: "relative_placement", entries: [], grid: [] },
      competition: {
        id: "c-community",
        name: "Community JnJ",
        comp_type: "jack_and_jill",
        test_comp: false,
        event: { id: "ev-comm", host_kind: "community" },
      },
    },
  ];

  it("excludes community when building CCS hub past", () => {
    const comps = aggregateCompetitionResultsFromRounds(rounds, {
      excludeCommunity: true,
    });
    expect(comps.map((c) => c.id)).toEqual(["c-ccs"]);
  });

  it("excludes CCS when building non-CCS event summary", () => {
    const comps = aggregateCompetitionResultsFromRounds(rounds, {
      eventId: "ev-comm",
      excludeCcs: true,
    });
    expect(comps.map((c) => c.id)).toEqual(["c-community"]);
  });
});