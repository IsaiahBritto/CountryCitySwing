import { NextRequest, NextResponse } from "next/server";
import { requireJudgeAuth } from "@/lib/judgeAuth";
import { supabaseServer } from "@/lib/supabaseServer";

interface JudgeRoundPayload {
  id: string;
  round_type: string;
  judged_role: string | null;
  scoring_mode: string;
  status: string;
  round_order: number;
  judgeAssignmentId: string;
  judgeRole: string;
  sheetStatus: string | null;
  readyToJudge: boolean;
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
    .select("id, name, comp_type, event:events(title, starts_at)")
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

  const roundsByCompetition = new Map<string, JudgeRoundPayload[]>();

  for (const round of rounds ?? []) {
    const assignment = assignmentByCompetition.get(round.competition_id);
    if (!assignment) continue;
    const sheet = (sheets ?? []).find(
      (s) =>
        s.round_id === round.id && s.judge_assignment_id === assignment.id
    );
    const sheetStatus = sheet?.status ?? null;
    const roundPayload: JudgeRoundPayload = {
      id: round.id,
      round_type: round.round_type,
      judged_role: round.judged_role,
      scoring_mode: round.scoring_mode,
      status: round.status,
      round_order: round.round_order,
      judgeAssignmentId: assignment.id,
      judgeRole: assignment.judge_role,
      sheetStatus,
      readyToJudge: round.status === "open" && sheetStatus !== "submitted",
    };
    const list = roundsByCompetition.get(round.competition_id) ?? [];
    list.push(roundPayload);
    roundsByCompetition.set(round.competition_id, list);
  }

  const assignmentsPayload = auth.assignments.map((a) => ({
    id: a.id,
    competitionId: a.competition_id,
    judgeRole: a.judge_role,
    competition: competitionById.get(a.competition_id) ?? null,
    rounds: roundsByCompetition.get(a.competition_id) ?? [],
  }));

  return NextResponse.json({ assignments: assignmentsPayload });
}
