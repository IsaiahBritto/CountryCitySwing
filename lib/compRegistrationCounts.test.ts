import type { CompSignupRow } from "@/lib/comps/types";
import { describe, expect, it } from "vitest";
import { summarizeCompDivisionRegistrations } from "@/lib/compRegistrationCounts";

function row(partial: Partial<CompSignupRow> & { id: string }): CompSignupRow {
  return {
    event_id: "ev-1",
    event_title: "Test Comp",
    registrant_profile_id: null,
    strictly_selected: false,
    strictly_lead_profile_id: null,
    strictly_follow_profile_id: null,
    strictly_lead_first_name: null,
    strictly_lead_last_name: null,
    strictly_lead_email: null,
    strictly_follow_first_name: null,
    strictly_follow_last_name: null,
    strictly_follow_email: null,
    jnj_selected: false,
    jnj_lead_profile_id: null,
    jnj_follow_profile_id: null,
    jnj_lead_first_name: null,
    jnj_lead_last_name: null,
    jnj_lead_email: null,
    jnj_follow_first_name: null,
    jnj_follow_last_name: null,
    jnj_follow_email: null,
    paid: false,
    ...partial,
  };
}

describe("summarizeCompDivisionRegistrations", () => {
  it("returns zeros for empty input", () => {
    expect(summarizeCompDivisionRegistrations([])).toEqual({
      strictly: { couples: 0 },
      jnj: { total: 0, lead: 0, follow: 0 },
    });
  });

  it("counts strictly couples", () => {
    const summary = summarizeCompDivisionRegistrations([
      row({ id: "1", strictly_selected: true }),
      row({ id: "2", strictly_selected: true }),
      row({ id: "3", jnj_selected: true, jnj_lead_first_name: "A" }),
    ]);
    expect(summary.strictly.couples).toBe(2);
  });

  it("counts jnj lead and follow rows", () => {
    const summary = summarizeCompDivisionRegistrations([
      row({
        id: "1",
        jnj_selected: true,
        jnj_lead_profile_id: "p1",
      }),
      row({
        id: "2",
        jnj_selected: true,
        jnj_follow_email: "f@example.com",
      }),
    ]);
    expect(summary.jnj).toEqual({ total: 2, lead: 1, follow: 1 });
  });

  it("counts dual-division signup toward both divisions", () => {
    const summary = summarizeCompDivisionRegistrations([
      row({
        id: "1",
        strictly_selected: true,
        jnj_selected: true,
        jnj_follow_first_name: "Pat",
      }),
    ]);
    expect(summary.strictly.couples).toBe(1);
    expect(summary.jnj.total).toBe(1);
    expect(summary.jnj.follow).toBe(1);
    expect(summary.jnj.lead).toBe(0);
  });
});
