import type {
  CompRoundRow,
  CompetitionRow,
  DanceRole,
  ScoringScope,
} from "@/lib/comps/types";
import type { JudgeWithProfile } from "@/lib/comps/roundData";
import { panelJudgesForRound } from "@/lib/comps/judgeScope";

const OPEN_OR_LATER = new Set([
  "open",
  "closed",
  "tabulated",
  "published",
]);

/** Whether this assignment should see/score this round. */
export function judgeScoresRound(
  assignment: Pick<JudgeWithProfile, "judge_role" | "scoring_scope" | "drops_finals">,
  round: Pick<CompRoundRow, "round_type" | "judged_role">
): boolean {
  if (assignment.judge_role === "chief_judge" && round.round_type !== "final") {
    return round.judged_role != null;
  }
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

export function headJudgeAssignmentIdForRole(
  competition: Pick<
    CompetitionRow,
    "lead_head_judge_assignment_id" | "follow_head_judge_assignment_id"
  >,
  role: DanceRole
): string | null {
  return role === "lead"
    ? competition.lead_head_judge_assignment_id
    : competition.follow_head_judge_assignment_id;
}

export function judgeEligibleForHeadJudgeRole(
  judge: Pick<JudgeWithProfile, "judge_role" | "scoring_scope">,
  role: DanceRole
): boolean {
  if (judge.judge_role !== "judge") return false;
  if (judge.scoring_scope === "both") return true;
  return judge.scoring_scope === role;
}

/** Designated head judge for a JnJ callback round, if configured and eligible. */
export function headJudgeForCallbackRound(
  competition: Pick<
    CompetitionRow,
    "comp_type" | "lead_head_judge_assignment_id" | "follow_head_judge_assignment_id"
  >,
  round: Pick<CompRoundRow, "round_type" | "judged_role" | "scoring_mode">,
  judges: JudgeWithProfile[],
  cjInPanel: boolean
): JudgeWithProfile | null {
  if (competition.comp_type !== "jack_and_jill") return null;
  if (round.scoring_mode !== "callback" || round.judged_role == null) return null;

  const hjId = headJudgeAssignmentIdForRole(competition, round.judged_role);
  if (!hjId) return null;

  const hj = judges.find((j) => j.id === hjId);
  if (!hj || !judgeEligibleForHeadJudgeRole(hj, round.judged_role)) return null;

  const panel = panelJudgesForRound(judges, round, cjInPanel);
  if (!panel.some((j) => j.id === hj.id)) return null;

  return hj;
}

/** True when any callback round for role is open or beyond. */
export function isHeadJudgeLockedForRole(
  rounds: Pick<CompRoundRow, "round_type" | "judged_role" | "status">[],
  role: DanceRole
): boolean {
  return rounds.some(
    (r) =>
      r.round_type !== "final" &&
      r.judged_role === role &&
      OPEN_OR_LATER.has(r.status)
  );
}
