import { describe, expect, it } from "vitest";
import { judgeScoresRound, panelJudgesForRound } from "@/lib/comps/judgeScope";
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
    first_name: "Judge",
    last_name: id,
    email: null,
    ...overrides,
  };
}

describe("judgeScoresRound", () => {
  const cj = judge("cj", { judge_role: "chief_judge", first_name: "Isaiah" });

  it("lets CJ score Strictly callback rounds (judged_role null)", () => {
    expect(
      judgeScoresRound(cj, {
        round_type: "prelims",
        judged_role: null,
      })
    ).toBe(true);
  });

  it("lets CJ score JnJ role-split callback rounds", () => {
    expect(
      judgeScoresRound(cj, {
        round_type: "prelims",
        judged_role: "lead",
      })
    ).toBe(true);
  });

  it("lets CJ score finals when not dropping finals", () => {
    expect(
      judgeScoresRound(cj, {
        round_type: "final",
        judged_role: null,
      })
    ).toBe(true);
  });

  it("excludes CJ from finals when drops_finals is set", () => {
    expect(
      judgeScoresRound(
        { ...cj, drops_finals: true },
        { round_type: "final", judged_role: null }
      )
    ).toBe(false);
  });
});

describe("panelJudgesForRound", () => {
  const cj = judge("cj", { judge_role: "chief_judge", first_name: "Isaiah" });

  it("includes CJ-only panel for Strictly callback when cj_in_panel", () => {
    const panel = panelJudgesForRound(
      [cj],
      { round_type: "prelims", judged_role: null },
      true
    );
    expect(panel.map((j) => j.id)).toEqual(["cj"]);
  });

  it("includes CJ-only panel for Strictly finals when cj_in_panel", () => {
    const panel = panelJudgesForRound(
      [cj],
      { round_type: "final", judged_role: null },
      true
    );
    expect(panel.map((j) => j.id)).toEqual(["cj"]);
  });

  it("excludes CJ from panel when cj_in_panel is false", () => {
    const panel = panelJudgesForRound(
      [cj],
      { round_type: "prelims", judged_role: null },
      false
    );
    expect(panel).toHaveLength(0);
  });
});
