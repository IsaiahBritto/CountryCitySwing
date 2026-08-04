import { describe, expect, it } from "vitest";
import { mapEntriesToSlots } from "./entryMapping";
import type { CompEntryRow } from "@/lib/comps/types";

function couple(id: string, bib: number): CompEntryRow & {
  lead_bib: { bib_number: number };
} {
  return {
    id,
    competition_id: "c1",
    entry_kind: "couple",
    role: null,
    lead_first_name: "",
    lead_last_name: "",
    lead_email: null,
    follow_first_name: "",
    follow_last_name: "",
    follow_email: null,
    lead_profile_id: null,
    follow_profile_id: null,
    lead_bib_id: null,
    follow_bib_id: null,
    comp_signup_id: null,
    source_lead_entry_id: null,
    source_follow_entry_id: null,
    lead_bib: { bib_number: bib },
  };
}

describe("mapEntriesToSlots", () => {
  it("assigns slots in bib order", () => {
    const map = mapEntriesToSlots(
      [couple("e3", 30), couple("e1", 10), couple("e2", 20)],
      { entryKind: "couple", minCount: 3, label: "Test" }
    );
    expect(map.bySlot.get("A")).toBe("e1");
    expect(map.bySlot.get("B")).toBe("e2");
    expect(map.bySlot.get("C")).toBe("e3");
  });

  it("throws when roster too small", () => {
    expect(() =>
      mapEntriesToSlots([couple("e1", 1)], {
        entryKind: "couple",
        minCount: 3,
        label: "Test",
      })
    ).toThrow(/at least 3/);
  });
});
