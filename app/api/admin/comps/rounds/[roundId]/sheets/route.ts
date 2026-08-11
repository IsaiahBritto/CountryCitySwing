import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminOrChiefJudgeAuth } from "@/lib/judgeAuth";

async function authorizeSheetChange(req: NextRequest, roundId: string) {
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, competition_id, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) {
    return { error: NextResponse.json({ error: "Round not found" }, { status: 404 }) };
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, round.competition_id);
  if (!auth.ok) return { error: auth.response };

  if (["tabulated", "published"].includes(round.status)) {
    return {
      error: NextResponse.json(
        {
          error:
            "This round is finalized. Remove the tabulation first to change judge sheets.",
        },
        { status: 409 }
      ),
    };
  }

  return { round };
}

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
  const authorized = await authorizeSheetChange(req, roundId);
  if ("error" in authorized) return authorized.error;

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

/**
 * DELETE: wipe all scores and the sheet row for one judge assignment.
 * Body: { judge_assignment_id }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const authorized = await authorizeSheetChange(req, roundId);
  if ("error" in authorized) return authorized.error;

  const body = await req.json();
  const judgeAssignmentId = body.judge_assignment_id;
  if (!judgeAssignmentId) {
    return NextResponse.json(
      { error: "judge_assignment_id is required" },
      { status: 400 }
    );
  }

  const { error: scoresError } = await supabaseServer
    .from("comp_scores")
    .delete()
    .eq("round_id", roundId)
    .eq("judge_assignment_id", judgeAssignmentId);
  if (scoresError) {
    return NextResponse.json(
      { error: "Failed to clear scores" },
      { status: 500 }
    );
  }

  const { error: sheetError } = await supabaseServer
    .from("comp_judge_sheets")
    .delete()
    .eq("round_id", roundId)
    .eq("judge_assignment_id", judgeAssignmentId);
  if (sheetError) {
    return NextResponse.json(
      { error: "Failed to clear judge sheet" },
      { status: 500 }
    );
  }

  return NextResponse.json({ cleared: true });
}
