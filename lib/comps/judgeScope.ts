import type { CompRoundRow, DanceRole, ScoringScope } from "@/lib/comps/types";
import type { JudgeWithProfile } from "@/lib/comps/roundData";

/** Whether this assignment should see/score this round. */
export function judgeScoresRound(
  assignment: Pick<JudgeWithProfile, "scoring_scope" | "drops_finals">,
  round: Pick<CompRoundRow, "round_type" | "judged_role">
): boolean {
  if (round.round_type === "final") {
    return !assignment.drops_finals;
  }
  if (round.judged_role == null) return true;
  if (assignment.scoring_scope === "both") return true;
  return assignment.scoring_scope === round.judged_role;
}

/** Panel judges for tabulation / sheet creation, filtered by scope and finals drop. */
export function panelJudgesForRound(
  judges: JudgeWithProfile[],
  round: Pick<CompRoundRow, "round_type" | "judged_role">,
  cjInPanel: boolean
): JudgeWithProfile[] {
  return judges.filter((j) => {
    if (!judgeScoresRound(j, round)) return false;
    if (j.judge_role === "chief_judge") {
      return cjInPanel;
    }
    return j.judge_role === "judge";
  });
}

export function siblingRoundFor(
  rounds: Pick<CompRoundRow, "id" | "round_type" | "judged_role">[],
  current: Pick<CompRoundRow, "id" | "round_type" | "judged_role">
): { id: string; judged_role: DanceRole } | null {
  if (current.judged_role == null) return null;
  const opposite: DanceRole = current.judged_role === "lead" ? "follow" : "lead";
  const match = rounds.find(
    (r) =>
      r.id !== current.id &&
      r.round_type === current.round_type &&
      r.judged_role === opposite
  );
  return match ? { id: match.id, judged_role: opposite } : null;
}

export function parseScoringScope(value: unknown): ScoringScope {
  if (value === "lead" || value === "follow" || value === "both") return value;
  return "both";
}
