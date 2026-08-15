import { describe, expect, it } from "vitest";
import {
  collectEventRegistrants,
  formatRegistrantCompLabels,
  ROLE_LABEL,
} from "@/lib/comps/eventRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";

describe("eventRegistrants re-export", () => {
  it("exposes role labels", () => {
    expect(ROLE_LABEL.jnj_lead).toBe("JnJ L");
    expect(ROLE_LABEL.strictly_follow).toBe("Strictly F");
  });

  it("formats division labels for bib confirmation", () => {
    expect(formatRegistrantCompLabels(["jnj_lead"])).toEqual([
      "Jack & Jill — Lead",
    ]);
    expect(
      formatRegistrantCompLabels(["jnj_lead", "strictly_lead"])
    ).toEqual(["Jack & Jill — Lead", "Strictly — Lead"]);
    expect(formatRegistrantCompLabels([])).toEqual(["Walk-up"]);
  });

  it("assigns role badges per division slot", () => {
    const signup: CompSignupRow = {
      id: "s1",
      event_id: "e1",
      event_title: "Comp Night",
      registrant_profile_id: null,
      strictly_selected: false,
      strictly_lead_profile_id: null,
      strictly_lead_first_name: null,
      strictly_lead_last_name: null,
      strictly_lead_email: null,
      strictly_follow_profile_id: null,
      strictly_follow_first_name: null,
      strictly_follow_last_name: null,
      strictly_follow_email: null,
      jnj_selected: true,
      jnj_lead_profile_id: "l1",
      jnj_lead_first_name: "Alex",
      jnj_lead_last_name: "Lead",
      jnj_lead_email: "alex@example.com",
      jnj_follow_profile_id: "f1",
      jnj_follow_first_name: "Bea",
      jnj_follow_last_name: "Follow",
      jnj_follow_email: "bea@example.com",
      paid: true,
    };
    const roster = collectEventRegistrants([signup], []);
    expect(roster).toHaveLength(2);
    expect(roster.find((r) => r.profileId === "l1")?.roles).toEqual([
      "jnj_lead",
    ]);
    expect(roster.find((r) => r.profileId === "f1")?.roles).toEqual([
      "jnj_follow",
    ]);
  });
});
