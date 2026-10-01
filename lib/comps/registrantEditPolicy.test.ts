import { describe, expect, it } from "vitest";
import type { RoundStatus } from "@/lib/comps/types";
import { personKeyFromFields } from "@/lib/comps/eventRegistrants";
import { patchTabulationEntries } from "@/lib/comps/tabulationDisplayPatch";

const PRE_SCORING: RoundStatus[] = ["pending", "checkin"];

function isPreScoringRoundStatus(status: RoundStatus): boolean {
  return PRE_SCORING.includes(status);
}

describe("registrantEditPolicy", () => {
  it("isPreScoringRoundStatus", () => {
    expect(isPreScoringRoundStatus("pending")).toBe(true);
    expect(isPreScoringRoundStatus("checkin")).toBe(true);
    expect(isPreScoringRoundStatus("open")).toBe(false);
    expect(isPreScoringRoundStatus("published")).toBe(false);
  });
});

describe("patchTabulationEntries", () => {
  it("updates callback ranked and entries displayName", () => {
    const tab = {
      mode: "callback" as const,
      judges: [],
      chiefJudge: null,
      callbackCount: 1,
      alternateCount: 0,
      entries: [
        {
          roundEntryId: "re1",
          entryId: "e1",
          bibNumber: 43,
          displayName: "Old Name",
          role: "follow" as const,
        },
      ],
      ranked: [
        {
          roundEntryId: "re1",
          rank: 1,
          points: 5,
          displayName: "Old Name",
          bibNumber: 43,
          advanced: true,
          alternateRank: null,
          votes: [],
          headJudgeVote: null,
          chiefJudgeVote: null,
        },
      ],
    };
    const displays = new Map([
      [
        "re1",
        {
          roundEntryId: "re1",
          entryId: "e1",
          bibNumber: 43,
          displayName: "Emma Eagle",
          role: "follow" as const,
        },
      ],
    ]);
    const out = patchTabulationEntries(tab as import("@/lib/comps/types").RoundTabulation, displays);
    expect(out.mode).toBe("callback");
    if (out.mode === "callback") {
      expect(out.entries[0].displayName).toBe("Emma Eagle");
      const ranked0 = out.ranked[0] as typeof out.ranked[0] & {
        displayName?: string;
      };
      expect(ranked0.displayName).toBe("Emma Eagle");
    }
  });

  it("updates relative_placement entries", () => {
    const tab = {
      mode: "relative_placement" as const,
      judges: [],
      chiefJudge: null,
      majority: 3,
      entries: [
        {
          roundEntryId: "re1",
          entryId: "e1",
          bibNumber: 1,
          displayName: "A",
          role: null,
        },
      ],
      grid: [],
    };
    const displays = new Map([
      [
        "re1",
        {
          roundEntryId: "re1",
          entryId: "e1",
          bibNumber: 1,
          displayName: "B",
          role: null,
        },
      ],
    ]);
    const out = patchTabulationEntries(tab, displays);
    if (out.mode === "relative_placement") {
      expect(out.entries[0].displayName).toBe("B");
    }
  });
});

describe("personKeyFromFields", () => {
  it("uses profile id when present", () => {
    expect(
      personKeyFromFields("abc", "x@y.com", "Jane", "Doe")
    ).toBe("profile:abc");
  });
});
