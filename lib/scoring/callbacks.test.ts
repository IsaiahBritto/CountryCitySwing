import { describe, expect, it } from "vitest";
import {
  CALLBACK_WEIGHTS,
  scoreCallbacks,
  type CallbackInput,
  type CallbackValue,
} from "@/lib/scoring/callbacks";

describe("scoreCallbacks", () => {
  it("uses the agreed vote weights", () => {
    expect(CALLBACK_WEIGHTS).toEqual({
      yes: 10,
      alt1: 4.5,
      alt2: 4.3,
      alt3: 4.2,
      no: 0,
    });
  });

  it("ranks by weighted points and marks advancers and alternates", () => {
    const input: CallbackInput = {
      judgeIds: ["J1", "J2", "J3"],
      entryIds: ["A", "B", "C", "D", "E"],
      callbackCount: 2,
      alternateCount: 1,
      votes: {
        J1: { A: "yes", B: "yes", C: "alt1", D: "no", E: "no" },
        J2: { A: "yes", B: "alt1", C: "yes", D: "alt2", E: "no" },
        J3: { A: "yes", B: "yes", C: "no", D: "alt1", E: "alt2" },
      },
    };
    const result = scoreCallbacks(input);
    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.A.points).toBe(30);
    expect(byId.B.points).toBe(24.5);
    expect(byId.C.points).toBe(14.5);
    expect(byId.D.points).toBe(8.8); // alt2 (4.3) + alt1 (4.5)
    expect(byId.E.points).toBe(4.3);
    expect(byId.A.advanced).toBe(true);
    expect(byId.B.advanced).toBe(true);
    expect(byId.C.advanced).toBe(false);
    expect(byId.C.alternateRank).toBe(1);
    expect(byId.D.alternateRank).toBeNull();
  });

  it("treats missing votes as no", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B"],
      callbackCount: 1,
      alternateCount: 0,
      votes: {
        J1: { A: "yes" },
        J2: { A: "yes", B: "alt1" },
      },
    });
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.A.points).toBe(20);
    expect(byId.B.points).toBe(4.5);
    expect(byId.A.advanced).toBe(true);
    expect(byId.B.advanced).toBe(false);
  });

  it("flags a points tie across the advance boundary as unresolved", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
        J2: { A: "yes", B: "no", C: "yes" },
      },
    });
    expect(result.unresolvedTies).toHaveLength(1);
    expect(result.unresolvedTies[0].boundary).toBe("advance");
    expect([...result.unresolvedTies[0].entryIds].sort()).toEqual(["B", "C"]);
    expect(result.unresolvedTies[0].points).toBe(10);
  });

  it("does not flag ties that sit entirely on one side of the boundaries", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
      },
    });
    // A and B tie at 10 points but both advance; no decision needed.
    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.A.advanced).toBe(true);
    expect(byId.B.advanced).toBe(true);
  });

  it("flags a tie across the alternate boundary", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C", "D"],
      callbackCount: 1,
      alternateCount: 1,
      votes: {
        J1: { A: "yes", B: "alt1", C: "alt1", D: "no" },
        J2: { A: "yes", B: "alt2", C: "alt2", D: "no" },
      },
    });
    // B and C tie at 8.8 across the single alternate slot.
    expect(result.unresolvedTies).toHaveLength(1);
    expect(result.unresolvedTies[0].boundary).toBe("alternate");
    expect([...result.unresolvedTies[0].entryIds].sort()).toEqual(["B", "C"]);
  });

  it("flags equal-point ties within the alternate zone (alt1 vs alt2 ordering)", () => {
    const entryIds = Array.from({ length: 13 }, (_, i) => `E${i}`);
    const votes: CallbackInput["votes"] = {
      J1: {},
      J2: {},
      J3: {},
      J4: {},
      J5: {},
    };
    for (let i = 0; i < 10; i++) {
      for (const j of Object.keys(votes)) {
        votes[j][entryIds[i]] = "yes";
      }
    }
    votes.J1[entryIds[10]] = "alt1";
    votes.J1[entryIds[11]] = "alt2";
    votes.J2[entryIds[10]] = "alt2";
    votes.J2[entryIds[11]] = "alt1";
    votes.J3[entryIds[10]] = "alt1";
    votes.J3[entryIds[11]] = "alt2";
    votes.J4[entryIds[10]] = "alt2";
    votes.J4[entryIds[11]] = "alt1";
    votes.J5[entryIds[10]] = "alt3";
    votes.J5[entryIds[11]] = "alt3";

    const result = scoreCallbacks({
      judgeIds: ["J1", "J2", "J3", "J4", "J5"],
      entryIds,
      callbackCount: 10,
      alternateCount: 2,
      votes,
    });
    expect(result.unresolvedTies).toHaveLength(1);
    expect(result.unresolvedTies[0].boundary).toBe("alternate");
    expect([...result.unresolvedTies[0].entryIds].sort()).toEqual([
      "E10",
      "E11",
    ]);
    expect(result.unresolvedTies[0].points).toBe(21.8);
  });

  it("applies a manual resolution to a boundary tie", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
        J2: { A: "yes", B: "no", C: "yes" },
      },
      manualTieResolutions: [["C", "B"]],
    });
    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.C.advanced).toBe(true);
    expect(byId.C.resolvedByDecision).toBe(true);
    expect(byId.B.advanced).toBe(false);
  });

  it("breaks an advance boundary tie via chief judge votes", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
        J2: { A: "yes", B: "no", C: "yes" },
      },
      chiefJudgeVotes: { A: "yes", B: "yes", C: "no" },
    });
    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.B.advanced).toBe(true);
    expect(byId.C.advanced).toBe(false);
    expect(byId.B.resolvedByChiefJudge).toBe(true);
    expect(byId.B.tieBreakNote).toContain("chief judge");
  });

  it("still unresolved when CJ gives identical votes on a boundary tie", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
        J2: { A: "yes", B: "no", C: "yes" },
      },
      chiefJudgeVotes: { A: "yes", B: "no", C: "no" },
    });
    expect(result.unresolvedTies).toHaveLength(1);
    expect([...result.unresolvedTies[0].entryIds].sort()).toEqual(["B", "C"]);
  });

  it("breaks within-alternate-zone tie via CJ alt1 vs alt2", () => {
    const entryIds = Array.from({ length: 13 }, (_, i) => `E${i}`);
    const votes: CallbackInput["votes"] = {
      J1: {},
      J2: {},
      J3: {},
      J4: {},
      J5: {},
    };
    for (let i = 0; i < 10; i++) {
      for (const j of Object.keys(votes)) {
        votes[j][entryIds[i]] = "yes";
      }
    }
    votes.J1[entryIds[10]] = "alt1";
    votes.J1[entryIds[11]] = "alt2";
    votes.J2[entryIds[10]] = "alt2";
    votes.J2[entryIds[11]] = "alt1";
    votes.J3[entryIds[10]] = "alt1";
    votes.J3[entryIds[11]] = "alt2";
    votes.J4[entryIds[10]] = "alt2";
    votes.J4[entryIds[11]] = "alt1";
    votes.J5[entryIds[10]] = "alt3";
    votes.J5[entryIds[11]] = "alt3";

    const chiefJudgeVotes: Record<string, CallbackValue> = {};
    for (const id of entryIds) {
      chiefJudgeVotes[id] = "no";
    }
    chiefJudgeVotes[entryIds[10]] = "alt1";
    chiefJudgeVotes[entryIds[11]] = "alt2";

    const result = scoreCallbacks({
      judgeIds: ["J1", "J2", "J3", "J4", "J5"],
      entryIds,
      callbackCount: 10,
      alternateCount: 2,
      votes,
      chiefJudgeVotes,
    });
    expect(result.unresolvedTies).toEqual([]);
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId[entryIds[10]].alternateRank).toBe(1);
    expect(byId[entryIds[11]].alternateRank).toBe(2);
    expect(byId[entryIds[10]].resolvedByChiefJudge).toBe(true);
  });

  it("unresolved when CJ vote missing on a tied entry", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
        J2: { A: "yes", B: "no", C: "yes" },
      },
      chiefJudgeVotes: { A: "yes", B: "yes" },
    });
    expect(result.unresolvedTies).toHaveLength(1);
  });

  it("manual resolution takes precedence over CJ votes", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2"],
      entryIds: ["A", "B", "C"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "no" },
        J2: { A: "yes", B: "no", C: "yes" },
      },
      chiefJudgeVotes: { A: "yes", B: "yes", C: "no" },
      manualTieResolutions: [["C", "B"]],
    });
    const byId = Object.fromEntries(result.ranked.map((r) => [r.entryId, r]));
    expect(byId.C.advanced).toBe(true);
    expect(byId.C.resolvedByDecision).toBe(true);
    expect(byId.C.resolvedByChiefJudge).toBe(false);
  });

  it("3-way panel tie at advance cut: CJ partial break advances top two", () => {
    const result = scoreCallbacks({
      judgeIds: ["J1", "J2", "J3"],
      entryIds: ["A", "B", "C", "D"],
      callbackCount: 2,
      alternateCount: 0,
      votes: {
        J1: { A: "yes", B: "yes", C: "yes", D: "no" },
        J2: { A: "yes", B: "yes", C: "yes", D: "no" },
        J3: { A: "yes", B: "yes", C: "yes", D: "no" },
      },
      chiefJudgeVotes: { A: "yes", B: "alt1", C: "no", D: "no" },
    });
    expect(result.unresolvedTies).toEqual([]);
    const advancers = result.ranked.filter((r) => r.advanced).map((r) => r.entryId);
    expect(advancers).toEqual(["A", "B"]);
  });
});
