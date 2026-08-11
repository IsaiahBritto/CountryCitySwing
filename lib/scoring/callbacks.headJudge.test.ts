import { describe, expect, it } from "vitest";
import { scoreCallbacks } from "@/lib/scoring/callbacks";

describe("scoreCallbacks head judge cascade", () => {
  const boundaryVotes = {
    J1: { A: "yes" as const, B: "yes" as const, C: "no" as const },
    J2: { A: "yes" as const, B: "no" as const, C: "yes" as const },
  };

  it("uses head judge votes before chief judge fallback", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: boundaryVotes,
      headJudgeVotes: { A: "yes", B: "yes", C: "no" },
      chiefJudgeVotes: { A: "yes", B: "no", C: "yes" },
    });

    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.B.advanced).toBe(true);
    expect(byId.C.advanced).toBe(false);
    expect(byId.B.resolvedByHeadJudge).toBe(true);
  });

  it("falls back to chief judge when head judge cannot break tie", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: boundaryVotes,
      headJudgeVotes: { A: "yes", B: "yes", C: "yes" },
      chiefJudgeVotes: { A: "yes", B: "yes", C: "no" },
    });

    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.B.advanced).toBe(true);
    expect(byId.B.resolvedByChiefJudge).toBe(true);
  });

  it("records manual decision with CJ scores flag", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: boundaryVotes,
      headJudgeVotes: { A: "yes", B: "yes", C: "no" },
      chiefJudgeVotes: { A: "yes", B: "yes", C: "no" },
      manualTieResolutions: [["B", "C"]],
      manualTieUsedCjScores: [true],
    });

    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.B.resolvedByDecision).toBe(true);
    expect(byId.B.resolvedByDecisionWithCjScores).toBe(true);
  });
});
