import { describe, expect, it } from "vitest";
import { groupJudgeRoundSlots, type JudgeRoundRow } from "./judgeRoundSlots";

function round(
  partial: Partial<JudgeRoundRow> & Pick<JudgeRoundRow, "id" | "round_type" | "judged_role">
): JudgeRoundRow {
  return {
    status: "open",
    sheetStatus: null,
    readyToJudge: false,
    round_order: 1,
    ...partial,
  };
}

describe("groupJudgeRoundSlots", () => {
  const lead = round({
    id: "lead-1",
    round_type: "semifinal",
    judged_role: "lead",
    siblingRound: { id: "follow-1", judged_role: "follow" },
    readyToJudge: true,
  });
  const follow = round({
    id: "follow-1",
    round_type: "semifinal",
    judged_role: "follow",
    siblingRound: { id: "lead-1", judged_role: "lead" },
    status: "open",
    sheetStatus: "submitted",
  });

  it("merges lead/follow siblings when scoring scope is both", () => {
    const slots = groupJudgeRoundSlots([lead, follow], "both");
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe("Semifinal");
    expect(slots[0].readyToJudge).toBe(true);
    expect(slots[0].roundId).toBe("lead-1");
  });

  it("keeps separate rows when scope is lead only", () => {
    const slots = groupJudgeRoundSlots([lead], "lead");
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toContain("Leads");
  });

  it("prefers ready follow round for link when only follow is open", () => {
    const leadClosed = round({
      ...lead,
      readyToJudge: false,
      status: "closed",
    });
    const followReady = round({
      ...follow,
      readyToJudge: true,
      status: "open",
      sheetStatus: null,
    });
    const slots = groupJudgeRoundSlots([leadClosed, followReady], "both");
    expect(slots[0].roundId).toBe("follow-1");
    expect(slots[0].readyToJudge).toBe(true);
  });

  it("merges submitted status when both sides submitted", () => {
    const leadSubmitted = round({
      ...lead,
      readyToJudge: false,
      sheetStatus: "submitted",
    });
    const followSubmitted = round({
      ...follow,
      readyToJudge: false,
      sheetStatus: "submitted",
    });
    const slots = groupJudgeRoundSlots([leadSubmitted, followSubmitted], "both");
    expect(slots[0].statusLabel).toBe("Submitted");
  });
});
