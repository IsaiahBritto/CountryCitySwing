import { describe, expect, it } from "vitest";
import {
  activeJudgeRoundView,
  parseJudgeRoundBundle,
  showJudgeRoleToggle,
} from "@/lib/comps/judgeRoundViews";
import type { JudgeRoundApiResponse } from "@/lib/comps/judgeRoundViews";

function mockResponse(
  overrides: Partial<JudgeRoundApiResponse> & Pick<JudgeRoundApiResponse, "round">
): JudgeRoundApiResponse {
  return {
    checkin: { unresolved: 0, present: 10, complete: true },
    sheet: { status: "draft", submitted_at: null },
    entries: [],
    scores: [],
    competition: { id: "c1", name: "Test J&J", comp_type: "jnj" },
    judgeAssignmentId: "ja1",
    judgeRole: "judge",
    scoringScope: "both",
    siblingRound: { id: "follow-1", judged_role: "follow" },
    siblingContext: {
      round: {
        id: "follow-1",
        competition_id: "c1",
        round_type: "semifinal",
        judged_role: "follow",
        scoring_mode: "callback",
        callback_count: 10,
        alternate_count: 3,
        status: "open",
      },
      checkin: { unresolved: 0, present: 10, complete: true },
      sheet: { status: "draft", submitted_at: null },
      entries: [],
      scores: [],
    },
    ...overrides,
  };
}

describe("parseJudgeRoundBundle", () => {
  it("maps primary lead + sibling follow from API response", () => {
    const data = mockResponse({
      round: {
        id: "lead-1",
        competition_id: "c1",
        round_type: "semifinal",
        judged_role: "lead",
        scoring_mode: "callback",
        callback_count: 10,
        alternate_count: 3,
        status: "open",
      },
    });
    const { bundle, activeRole } = parseJudgeRoundBundle(data, "lead-1");
    expect(bundle.leadView?.round.id).toBe("lead-1");
    expect(bundle.followView?.round.id).toBe("follow-1");
    expect(activeRole).toBe("lead");
  });

  it("derives activeRole from URL when opening follow round", () => {
    const data = mockResponse({
      round: {
        id: "follow-1",
        competition_id: "c1",
        round_type: "semifinal",
        judged_role: "follow",
        scoring_mode: "callback",
        callback_count: 10,
        alternate_count: 3,
        status: "open",
      },
      siblingContext: {
        round: {
          id: "lead-1",
          competition_id: "c1",
          round_type: "semifinal",
          judged_role: "lead",
          scoring_mode: "callback",
          callback_count: 10,
          alternate_count: 3,
          status: "open",
        },
        checkin: { unresolved: 0, present: 10, complete: true },
        sheet: { status: "draft", submitted_at: null },
        entries: [],
        scores: [],
      },
      siblingRound: { id: "lead-1", judged_role: "lead" },
    });
    const { activeRole } = parseJudgeRoundBundle(data, "follow-1");
    expect(activeRole).toBe("follow");
  });
});

describe("showJudgeRoleToggle", () => {
  it("is true when both views exist and scope is both", () => {
    const data = mockResponse({
      round: {
        id: "lead-1",
        competition_id: "c1",
        round_type: "semifinal",
        judged_role: "lead",
        scoring_mode: "callback",
        callback_count: 10,
        alternate_count: 3,
        status: "open",
      },
    });
    const { bundle } = parseJudgeRoundBundle(data, "lead-1");
    expect(showJudgeRoleToggle(bundle)).toBe(true);
  });
});

describe("activeJudgeRoundView", () => {
  it("returns follow view when activeRole is follow", () => {
    const data = mockResponse({
      round: {
        id: "lead-1",
        competition_id: "c1",
        round_type: "semifinal",
        judged_role: "lead",
        scoring_mode: "callback",
        callback_count: 10,
        alternate_count: 3,
        status: "open",
      },
    });
    const { bundle } = parseJudgeRoundBundle(data, "lead-1");
    expect(activeJudgeRoundView(bundle, "follow")?.round.id).toBe("follow-1");
  });
});
