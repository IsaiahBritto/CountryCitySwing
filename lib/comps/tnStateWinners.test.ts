import { describe, expect, it } from "vitest";
import type { HubPastEvent } from "@/lib/comps/hubTypes";
import {
  collectTnStateWinners,
  featuredTnStateCompetitions,
  featuredTnStateEvent,
  isTnStateCompetition,
  pastExcludingTnState,
  tnStateByCompType,
} from "@/lib/comps/tnStateWinners";

function makeEvent(
  overrides: Partial<HubPastEvent> & Pick<HubPastEvent, "id">
): HubPastEvent {
  return {
    title: "Event",
    starts_at: "2026-01-01T00:00:00Z",
    location: null,
    strictly_level: null,
    jnj_level: null,
    competitions: [],
    ...overrides,
  };
}

function makeComp(
  id: string,
  comp_type: "strictly" | "jack_and_jill",
  latestPublishedAt: string | null = "2026-01-02T00:00:00Z"
) {
  return {
    id,
    name: comp_type === "strictly" ? "Strictly" : "JnJ",
    comp_type,
    publishedRounds: 1,
    podium: null,
    latestPublishedAt,
  };
}

describe("isTnStateCompetition", () => {
  it("matches division level on the event", () => {
    const event = makeEvent({
      id: "e1",
      strictly_level: "TN State",
      jnj_level: "Open",
    });
    expect(isTnStateCompetition(event, makeComp("s1", "strictly"))).toBe(true);
    expect(isTnStateCompetition(event, makeComp("j1", "jack_and_jill"))).toBe(
      false
    );
  });
});

describe("collectTnStateWinners", () => {
  it("collects TN State divisions only", () => {
    const past: HubPastEvent[] = [
      makeEvent({
        id: "e1",
        strictly_level: "TN State",
        jnj_level: "TN State",
        competitions: [
          makeComp("s1", "strictly"),
          makeComp("j1", "jack_and_jill"),
          makeComp("s2", "strictly"),
        ],
      }),
      makeEvent({
        id: "e2",
        strictly_level: "Open",
        competitions: [makeComp("s3", "strictly")],
      }),
    ];
    past[0].competitions[2].comp_type = "strictly";
    past[0].competitions.pop();

    const rows = collectTnStateWinners(past);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.comp.id).sort()).toEqual(["j1", "s1"]);
  });
});

describe("featuredTnStateEvent", () => {
  it("returns the newest event with TN State divisions", () => {
    const past: HubPastEvent[] = [
      makeEvent({
        id: "old",
        starts_at: "2024-01-01T00:00:00Z",
        strictly_level: "TN State",
        competitions: [makeComp("s-old", "strictly")],
      }),
      makeEvent({
        id: "new",
        starts_at: "2026-06-01T00:00:00Z",
        jnj_level: "TN State",
        competitions: [makeComp("j-new", "jack_and_jill")],
      }),
    ];
    expect(featuredTnStateEvent(past)?.id).toBe("new");
  });
});

describe("featuredTnStateCompetitions", () => {
  it("filters TN divisions on one event", () => {
    const event = makeEvent({
      id: "e1",
      strictly_level: "TN State",
      jnj_level: "TN State",
      competitions: [
        makeComp("s1", "strictly"),
        makeComp("j1", "jack_and_jill"),
        makeComp("o1", "strictly"),
      ],
    });
    event.competitions[2].comp_type = "strictly";
    event.strictly_level = "TN State";
    event.jnj_level = "TN State";
    event.competitions = [
      makeComp("s1", "strictly"),
      makeComp("j1", "jack_and_jill"),
    ];
    expect(featuredTnStateCompetitions(event).map((c) => c.id)).toEqual([
      "s1",
      "j1",
    ]);
  });
});

describe("pastExcludingTnState", () => {
  it("drops TN divisions and empty events", () => {
    const past: HubPastEvent[] = [
      makeEvent({
        id: "tn-only",
        strictly_level: "TN State",
        competitions: [makeComp("s1", "strictly")],
      }),
      makeEvent({
        id: "mixed",
        strictly_level: "TN State",
        jnj_level: "Open",
        competitions: [
          makeComp("s1", "strictly"),
          makeComp("j1", "jack_and_jill"),
        ],
      }),
    ];
    const filtered = pastExcludingTnState(past);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("mixed");
    expect(filtered[0].competitions.map((c) => c.id)).toEqual(["j1"]);
  });
});

describe("tnStateByCompType", () => {
  it("sorts by event date descending", () => {
    const past: HubPastEvent[] = [
      makeEvent({
        id: "e1",
        starts_at: "2025-01-01T00:00:00Z",
        strictly_level: "TN State",
        competitions: [makeComp("s1", "strictly", "2025-01-03T00:00:00Z")],
      }),
      makeEvent({
        id: "e2",
        starts_at: "2026-01-01T00:00:00Z",
        strictly_level: "TN State",
        competitions: [makeComp("s2", "strictly", "2026-01-03T00:00:00Z")],
      }),
    ];
    const rows = tnStateByCompType(past, "strictly");
    expect(rows.map((r) => r.comp.id)).toEqual(["s2", "s1"]);
  });
});
