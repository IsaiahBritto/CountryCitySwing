import type { CompRoundRow, CompetitionRow, DanceRole } from "@/lib/comps/types";
import type { JudgeWithProfile } from "@/lib/comps/roundData";
import {
  headJudgeAssignmentIdForRole,
  isHeadJudgeLockedForRole,
  judgeEligibleForHeadJudgeRole,
} from "@/lib/comps/judgeScope";

export function validateHeadJudgeAssignment(
  competition: CompetitionRow,
  assignmentId: string | null,
  role: DanceRole,
  judges: Pick<JudgeWithProfile, "id" | "judge_role" | "scoring_scope">[]
): string | null {
  if (assignmentId == null) return null;
  if (competition.comp_type !== "jack_and_jill") {
    return "Head judges are only supported for Jack & Jill competitions";
  }
  const judge = judges.find((j) => j.id === assignmentId);
  if (!judge) return "Head judge assignment not found in this competition";
  if (!judgeEligibleForHeadJudgeRole(judge, role)) {
    return `Selected judge cannot head-judge ${role} rounds (check scoring scope)`;
  }
  return null;
}

export function isJudgeDesignatedHeadJudge(
  competition: Pick<
    CompetitionRow,
    "lead_head_judge_assignment_id" | "follow_head_judge_assignment_id"
  >,
  assignmentId: string
): boolean {
  return (
    competition.lead_head_judge_assignment_id === assignmentId ||
    competition.follow_head_judge_assignment_id === assignmentId
  );
}

export function headJudgeRoleConflictMessage(
  competition: CompetitionRow,
  assignmentId: string,
  newScope: string
): string | null {
  if (competition.lead_head_judge_assignment_id === assignmentId) {
    if (newScope === "follow") {
      return "Clear lead head judge before changing this judge to follows-only scope";
    }
  }
  if (competition.follow_head_judge_assignment_id === assignmentId) {
    if (newScope === "lead") {
      return "Clear follow head judge before changing this judge to leads-only scope";
    }
  }
  return null;
}

export { headJudgeAssignmentIdForRole, isHeadJudgeLockedForRole };
