import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminOrChiefJudgeAuth } from "@/lib/judgeAuth";

/**
 * PATCH: unlock a submitted judge sheet so the judge can fix and resubmit.
 * Allowed only while the round is not yet tabulated (stepping a round back
 * re-enables this). Body: { judge_assignment_id }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;

  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, competition_id, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, round.competition_id);
  if (!auth.ok) return auth.response;

  if (["tabulated", "published"].includes(round.status)) {
    return NextResponse.json(
      {
        error:
          "This round is finalized. Remove the tabulation first to unlock judge sheets.",
      },
      { status: 409 }
    );
  }

  const body = await req.json();
  const judgeAssignmentId = body.judge_assignment_id;
  if (!judgeAssignmentId) {
    return NextResponse.json(
      { error: "judge_assignment_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("comp_judge_sheets")
    .update({
      status: "draft",
      submitted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("round_id", roundId)
    .eq("judge_assignment_id", judgeAssignmentId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "Failed to unlock sheet" }, { status: 500 });
  }
  return NextResponse.json({ sheet: data });
}
