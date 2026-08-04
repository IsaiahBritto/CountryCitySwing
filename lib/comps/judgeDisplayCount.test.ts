import { describe, expect, it } from "vitest";
import {
  hasDuplicateChiefJudges,
  judgeDisplayCount,
} from "./judgeDisplayCount";

describe("judgeDisplayCount", () => {
  it("counts panel judges plus one CJ slot", () => {
    const judges = [
      { judge_role: "judge" },
      { judge_role: "judge" },
      { judge_role: "chief_judge" },
    ];
    expect(judgeDisplayCount(judges)).toBe(3);
  });

  it("ignores duplicate CJ rows in the display count", () => {
    const judges = [
      { judge_role: "judge" },
      { judge_role: "judge" },
      { judge_role: "chief_judge" },
      { judge_role: "chief_judge" },
    ];
    expect(judgeDisplayCount(judges)).toBe(3);
    expect(hasDuplicateChiefJudges(judges)).toBe(true);
  });
});
