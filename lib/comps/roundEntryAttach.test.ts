import { describe, expect, it } from "vitest";
import {
  compEntryMatchesRoundSeed,
  roundAcceptsLateEntries,
  type AttachableCompEntry,
  type LateAttachRoundRef,
} from "@/lib/comps/roundEntryAttachEligibility";
import type { RoundSlotRef } from "@/lib/comps/roundChain";

const jnjLeadPrelim: LateAttachRoundRef = {
  id: "r-lead",
  round_type: "prelims",
  judged_role: "lead",
  status: "checkin",
  round_order: 1,
};

const jnjFollowPrelim: LateAttachRoundRef = {
  id: "r-follow",
  round_type: "prelims",
  judged_role: "follow",
  status: "checkin",
  round_order: 1,
};

const jnjFinals: LateAttachRoundRef = {
  id: "r-final",
  round_type: "final",
  judged_role: null,
  status: "checkin",
  round_order: 4,
};

const leadEntry: AttachableCompEntry = {
  id: "e1",
  entry_kind: "individual",
  role: "lead",
  source_lead_entry_id: null,
};

const followEntry: AttachableCompEntry = {
  id: "e2",
  entry_kind: "individual",
  role: "follow",
  source_lead_entry_id: null,
};

const drawnEntry: AttachableCompEntry = {
  id: "e3",
  entry_kind: "individual",
  role: "lead",
  source_lead_entry_id: "other",
};

const strictlyCouple: AttachableCompEntry = {
  id: "e4",
  entry_kind: "couple",
  role: null,
};

const allRoundsFirstSlotOnly: RoundSlotRef[] = [
  {
    id: "r-lead",
    round_type: "prelims",
    judged_role: "lead",
    status: "checkin",
    round_order: 1,
  },
];

const allRoundsWithQuarter: RoundSlotRef[] = [
  ...allRoundsFirstSlotOnly,
  {
    id: "r-q",
    round_type: "quarterfinal",
    judged_role: "lead",
    status: "pending",
    round_order: 2,
  },
];

describe("compEntryMatchesRoundSeed", () => {
  it("JnJ lead prelim accepts lead individual only", () => {
    expect(
      compEntryMatchesRoundSeed(leadEntry, "jack_and_jill", jnjLeadPrelim)
    ).toBe(true);
    expect(
      compEntryMatchesRoundSeed(followEntry, "jack_and_jill", jnjLeadPrelim)
    ).toBe(false);
  });

  it("JnJ follow prelim accepts follow individual only", () => {
    expect(
      compEntryMatchesRoundSeed(followEntry, "jack_and_jill", jnjFollowPrelim)
    ).toBe(true);
    expect(
      compEntryMatchesRoundSeed(leadEntry, "jack_and_jill", jnjFollowPrelim)
    ).toBe(false);
  });

  it("rejects drawn individual rows for callback prelims", () => {
    expect(
      compEntryMatchesRoundSeed(drawnEntry, "jack_and_jill", jnjLeadPrelim)
    ).toBe(false);
  });

  it("strictly first prelims accept couples only", () => {
    const strictPrelim = {
      round_type: "prelims" as const,
      judged_role: null,
    };
    expect(
      compEntryMatchesRoundSeed(strictlyCouple, "strictly", strictPrelim)
    ).toBe(true);
    expect(
      compEntryMatchesRoundSeed(leadEntry, "strictly", strictPrelim)
    ).toBe(false);
  });

  it("JnJ couple finals accept couple entries", () => {
    expect(
      compEntryMatchesRoundSeed(strictlyCouple, "jack_and_jill", jnjFinals)
    ).toBe(true);
    expect(
      compEntryMatchesRoundSeed(leadEntry, "jack_and_jill", jnjFinals)
    ).toBe(false);
  });
});

describe("roundAcceptsLateEntries", () => {
  it("accepts pending and checkin first-slot rounds", () => {
    expect(
      roundAcceptsLateEntries(
        { ...jnjLeadPrelim, status: "pending" },
        "jack_and_jill",
        allRoundsFirstSlotOnly
      )
    ).toBe(true);
    expect(
      roundAcceptsLateEntries(
        jnjLeadPrelim,
        "jack_and_jill",
        allRoundsFirstSlotOnly
      )
    ).toBe(true);
  });

  it("rejects open rounds", () => {
    expect(
      roundAcceptsLateEntries(
        { ...jnjLeadPrelim, status: "open" },
        "jack_and_jill",
        allRoundsFirstSlotOnly
      )
    ).toBe(false);
  });

  it("rejects non-first-slot rounds", () => {
    const quarter: LateAttachRoundRef = {
      id: "r-q",
      round_type: "quarterfinal",
      judged_role: "lead",
      status: "pending",
      round_order: 2,
    };
    expect(
      roundAcceptsLateEntries(quarter, "jack_and_jill", allRoundsWithQuarter)
    ).toBe(false);
  });

  it("rejects JnJ finals for late attach", () => {
    expect(
      roundAcceptsLateEntries(jnjFinals, "jack_and_jill", [
        {
          id: "r-lead",
          round_type: "prelims",
          judged_role: "lead",
          status: "tabulated",
          round_order: 1,
        },
        {
          id: "r-final",
          round_type: "final",
          judged_role: null,
          status: "checkin",
          round_order: 4,
        },
      ])
    ).toBe(false);
  });
});