import { describe, expect, it } from "vitest";
import {
  headJudgeForCallbackRound,
  isHeadJudgeLockedForRole,
  judgeEligibleForHeadJudgeRole,
} from "@/lib/comps/judgeScope";
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
    first_name: "J",
    last_name: id,
    email: null,
    ...overrides,
  };
}

describe("headJudgeForCallbackRound", () => {
  const competition = {
    comp_type: "jack_and_jill" as const,
    lead_head_judge_assignment_id: "j1",
    follow_head_judge_assignment_id: null,
  };
  const round = {
    round_type: "prelims" as const,
    judged_role: "lead" as const,
    scoring_mode: "callback" as const,
  };

  it("returns designated head judge when in panel", () => {
    const j1 = judge("j1");
    const cj = judge("cj", { judge_role: "chief_judge" });
    const hj = headJudgeForCallbackRound(
      competition,
      round,
      [j1, cj],
      true
    );
    expect(hj?.id).toBe("j1");
  });

  it("returns null when head judge not in panel for role", () => {
    const jFollow = judge("j2", { scoring_scope: "follow" });
    const hj = headJudgeForCallbackRound(
      competition,
      round,
      [jFollow],
      false
    );
    expect(hj).toBeNull();
  });
});

describe("judgeEligibleForHeadJudgeRole", () => {
  it("rejects chief judge role", () => {
    expect(
      judgeEligibleForHeadJudgeRole(
        judge("cj", { judge_role: "chief_judge" }),
        "lead"
      )
    ).toBe(false);
  });

  it("allows both scope for either role", () => {
    expect(judgeEligibleForHeadJudgeRole(judge("j1"), "follow")).toBe(true);
  });
});

describe("isHeadJudgeLockedForRole", () => {
  it("locks after open", () => {
    expect(
      isHeadJudgeLockedForRole(
        [
          {
            round_type: "prelims",
            judged_role: "lead",
            status: "open",
          },
        ],
        "lead"
      )
    ).toBe(true);
  });

  it("does not lock when pending", () => {
    expect(
      isHeadJudgeLockedForRole(
        [
          {
            round_type: "prelims",
            judged_role: "lead",
            status: "pending",
          },
        ],
        "lead"
      )
    ).toBe(false);
  });
});
