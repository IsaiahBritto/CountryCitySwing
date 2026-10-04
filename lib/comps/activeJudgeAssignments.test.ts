import { describe, expect, it } from "vitest";
import { filterActiveJudgeAssignments } from "./activeJudgeAssignments";

describe("filterActiveJudgeAssignments", () => {
  const assignments = [
    { id: "a1", competition_id: "c-live" },
    { id: "a2", competition_id: "c-done" },
    { id: "a3", competition_id: "c-setup" },
  ];

  const competitions = [
    { id: "c-live", status: "in_progress" },
    { id: "c-done", status: "completed" },
    { id: "c-setup", status: "setup" },
  ];

  it("removes assignments for completed competitions", () => {
    const result = filterActiveJudgeAssignments(assignments, competitions);
    expect(result.map((r) => r.id)).toEqual(["a1", "a3"]);
  });

  it("drops assignments when competition row is missing", () => {
    const result = filterActiveJudgeAssignments(
      [{ id: "a1", competition_id: "missing" }],
      competitions
    );
    expect(result).toEqual([]);
  });
});
