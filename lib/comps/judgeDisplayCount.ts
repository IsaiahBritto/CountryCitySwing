/** Count judges the way the admin Judges tab displays them: panel + one CJ slot. */
export function judgeDisplayCount(
  judges: { judge_role: string }[]
): number {
  const panel = judges.filter((j) => j.judge_role === "judge").length;
  const hasCj = judges.some((j) => j.judge_role === "chief_judge");
  return panel + (hasCj ? 1 : 0);
}

/** True when more than one chief_judge assignment exists (data inconsistency). */
export function hasDuplicateChiefJudges(
  judges: { judge_role: string }[]
): boolean {
  return judges.filter((j) => j.judge_role === "chief_judge").length > 1;
}
