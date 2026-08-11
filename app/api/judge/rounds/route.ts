import { NextRequest, NextResponse } from "next/server";
import { requireJudgeAuth } from "@/lib/judgeAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { judgeScoresRound, siblingRoundFor } from "@/lib/comps/judgeScope";

interface JudgeRoundPayload {
  id: string;
  round_type: string;
  judged_role: string | null;
  scoring_mode: string;
  status: string;
  round_order: number;
  judgeAssignmentId: string;
  judgeRole: string;
  scoringScope: string;
  sheetStatus: string | null;
  readyToJudge: boolean;
  siblingRound: { id: string; judged_role: string } | null;
  headJudgeRole: "lead" | "follow" | null;
}

/** GET: the logged-in judge's assignments with nested round status. */
export async function GET(req: NextRequest) {
  const auth = await requireJudgeAuth(req);
  if (!auth.ok) return auth.response;

  const competitionIds = auth.assignments.map((a) => a.competition_id);
  if (competitionIds.length === 0) {
    return NextResponse.json({ assignments: [] });
  }

  const { data: competitions, error: competitionError } = await supabaseServer
    .from("competitions")
    .select(
      "id, name, comp_type, lead_head_judge_assignment_id, follow_head_judge_assignment_id, event:events(title, starts_at)"
    )
    .in("id", competitionIds);
  if (competitionError) {
    return NextResponse.json(
      { error: "Failed to load competitions" },
      { status: 500 }
    );
  }

  const competitionById = new Map((competitions ?? []).map((c) => [c.id, c]));

  const { data: rounds, error } = await supabaseServer
    .from("comp_rounds")
    .select(
      "id, competition_id, round_type, judged_role, scoring_mode, status, round_order"
    )
    .in("competition_id", competitionIds)
    .neq("status", "pending")
    .order("round_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to load rounds" }, { status: 500 });
  }

  const roundsByCompetition = new Map<string, typeof rounds>();
  for (const round of rounds ?? []) {
    const list = roundsByCompetition.get(round.competition_id) ?? [];
    list.push(round);
    roundsByCompetition.set(round.competition_id, list);
  }

  const assignmentByCompetition = new Map(
    auth.assignments.map((a) => [a.competition_id, a])
  );
  const roundIds = (rounds ?? []).map((r) => r.id);
  const assignmentIds = auth.assignments.map((a) => a.id);
  const { data: sheets } = roundIds.length
    ? await supabaseServer
        .from("comp_judge_sheets")
        .select("round_id, judge_assignment_id, status, submitted_at")
        .in("round_id", roundIds)
        .in("judge_assignment_id", assignmentIds)
    : { data: [] };

  const roundsByCompetitionPayload = new Map<string, JudgeRoundPayload[]>();

  for (const round of rounds ?? []) {
    const assignment = assignmentByCompetition.get(round.competition_id);
    if (!assignment) continue;
    if (!judgeScoresRound(assignment, round)) continue;

    const compRounds = roundsByCompetition.get(round.competition_id) ?? [];
    const sibling = siblingRoundFor(compRounds, round);

    const sheet = (sheets ?? []).find(
      (s) =>
        s.round_id === round.id && s.judge_assignment_id === assignment.id
    );
    const sheetStatus = sheet?.status ?? null;
    const comp = competitionById.get(round.competition_id) as {
      lead_head_judge_assignment_id?: string | null;
      follow_head_judge_assignment_id?: string | null;
    } | undefined;
    let headJudgeRole: "lead" | "follow" | null = null;
    if (
      assignment.id === comp?.lead_head_judge_assignment_id &&
      round.judged_role === "lead"
    ) {
      headJudgeRole = "lead";
    } else if (
      assignment.id === comp?.follow_head_judge_assignment_id &&
      round.judged_role === "follow"
    ) {
      headJudgeRole = "follow";
    }
    const roundPayload: JudgeRoundPayload = {
      id: round.id,
      round_type: round.round_type,
      judged_role: round.judged_role,
      scoring_mode: round.scoring_mode,
      status: round.status,
      round_order: round.round_order,
      judgeAssignmentId: assignment.id,
      judgeRole: assignment.judge_role,
      scoringScope: assignment.scoring_scope,
      sheetStatus,
      readyToJudge: round.status === "open" && sheetStatus !== "submitted",
      siblingRound: sibling,
      headJudgeRole,
    };
    const list = roundsByCompetitionPayload.get(round.competition_id) ?? [];
    list.push(roundPayload);
    roundsByCompetitionPayload.set(round.competition_id, list);
  }

  const assignmentsPayload = auth.assignments.map((a) => ({
    id: a.id,
    competitionId: a.competition_id,
    judgeRole: a.judge_role,
    scoringScope: a.scoring_scope,
    dropsFinals: a.drops_finals,
    competition: competitionById.get(a.competition_id) ?? null,
    rounds: roundsByCompetitionPayload.get(a.competition_id) ?? [],
  }));

  return NextResponse.json({ assignments: assignmentsPayload });
}
