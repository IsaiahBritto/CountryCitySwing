import { describe, expect, it } from "vitest";
import { buildJudgeColumnPreviews } from "@/lib/comps/judgeColumnPreview";
import type { JudgeWithProfile } from "@/lib/comps/roundData";

function judge(
  id: string,
  overrides: Partial<JudgeWithProfile> = {}
): JudgeWithProfile {
  return {
    id,
    competition_id: "c1",
    profile_id: `p-${id}`,
    judge_role: "judge",
    scoring_scope: "both",
    drops_finals: false,
    first_name: id.toUpperCase(),
    last_name: "Judge",
    email: null,
    ...overrides,
  };
}

describe("buildJudgeColumnPreviews", () => {
  it("shows Isaiah CJ in panel with HJ J1 for leads", () => {
    const j1 = judge("j1");
    const j2 = judge("j2");
    const isaiah = judge("cj", {
      judge_role: "chief_judge",
      first_name: "Isaiah",
      last_name: "",
    });

    const previews = buildJudgeColumnPreviews({
      compType: "jack_and_jill",
      judges: [j1, j2, isaiah],
      cjInPanel: true,
      leadHeadJudgeId: "j1",
      followHeadJudgeId: null,
    });

    const leads = previews.find((p) => p.title === "Callback — Leads")!;
    expect(leads.panelColumns.map((c) => c.label)).toEqual(["J1", "J2", "CJ"]);
    expect(leads.tieBreakColumn?.label).toBe("HJ: J1");
    expect(leads.fallbackNote).toMatch(/Isaiah/);
  });

  it("puts CJ in scoring judges when not in panel", () => {
    const j1 = judge("j1");
    const isaiah = judge("cj", {
      judge_role: "chief_judge",
      first_name: "Isaiah",
      last_name: "",
    });

    const previews = buildJudgeColumnPreviews({
      compType: "jack_and_jill",
      judges: [j1, isaiah],
      cjInPanel: false,
      leadHeadJudgeId: null,
      followHeadJudgeId: null,
    });

    const leads = previews.find((p) => p.title === "Callback — Leads")!;
    expect(leads.panelColumns.map((c) => c.label)).toEqual(["J1"]);
    expect(leads.scoringJudges.some((s) => s.name.includes("Isaiah"))).toBe(
      true
    );
  });

  it("Strictly callback: CJ-only panel when cj_in_panel", () => {
    const isaiah = judge("cj", {
      judge_role: "chief_judge",
      first_name: "Isaiah",
      last_name: "Britto",
    });

    const previews = buildJudgeColumnPreviews({
      compType: "strictly",
      judges: [isaiah],
      cjInPanel: true,
      leadHeadJudgeId: null,
      followHeadJudgeId: null,
    });

    const callback = previews.find((p) => p.title === "Callback")!;
    expect(callback.panelColumns.map((c) => c.label)).toEqual(["CJ"]);
    expect(callback.tieBreakColumn).toBeNull();
    expect(callback.warnings).not.toContain("No panel judges for this round");
  });

  it("Strictly finals: CJ-only panel when cj_in_panel", () => {
    const isaiah = judge("cj", {
      judge_role: "chief_judge",
      first_name: "Isaiah",
      last_name: "Britto",
    });

    const previews = buildJudgeColumnPreviews({
      compType: "strictly",
      judges: [isaiah],
      cjInPanel: true,
      leadHeadJudgeId: null,
      followHeadJudgeId: null,
    });

    const finals = previews.find((p) => p.title === "Finals")!;
    expect(finals.panelColumns.map((c) => c.label)).toEqual(["CJ"]);
    expect(finals.tieBreakColumn).toBeNull();
    expect(finals.warnings).not.toContain("No judges score finals");
  });
});
