import type { CompStatus } from "@/lib/comps/types";

type AssignmentWithCompetitionId = { competition_id: string };

type CompetitionStatusRow = { id: string; status: CompStatus | string };

/** Judge home should only list assignments for comps that are not marked completed. */
export function filterActiveJudgeAssignments<T extends AssignmentWithCompetitionId>(
  assignments: T[],
  competitions: CompetitionStatusRow[]
): T[] {
  const statusById = new Map(competitions.map((c) => [c.id, c.status]));
  return assignments.filter((a) => {
    const status = statusById.get(a.competition_id);
    return status != null && status !== "completed";
  });
}
