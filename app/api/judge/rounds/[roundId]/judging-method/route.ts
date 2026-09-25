import { NextRequest, NextResponse } from "next/server";
import { resolveJudgeRound } from "@/lib/comps/judgeRoundResolve";
import { supabaseServer } from "@/lib/supabaseServer";
import type { CallbackJudgingMethod } from "@/lib/comps/types";

const VALID: CallbackJudgingMethod[] = ["placement", "raw"];

/**
 * POST: set callback judging method once per sheet (Yes/No vs raw primary input).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const method = body.judging_method;
  if (method !== "placement" && method !== "raw") {
    return NextResponse.json(
      { error: "judging_method must be placement or raw" },
      { status: 400 }
    );
  }
  if (!VALID.includes(method)) {
    return NextResponse.json({ error: "Invalid judging_method" }, { status: 400 });
  }

  const resolved = await resolveJudgeRound(
    req,
    roundId,
    typeof body.judge_assignment_id === "string"
      ? body.judge_assignment_id
      : null
  );
  if (resolved instanceof NextResponse) return resolved;
  const { ctx, assignmentId } = resolved;

  if (ctx.round.scoring_mode !== "callback") {
    return NextResponse.json(
      { error: "Judging method applies to callback rounds only" },
      { status: 400 }
    );
  }

  const existing = ctx.sheets.find(
    (s) => s.judge_assignment_id === assignmentId
  );
  if (existing?.judging_method) {
    return NextResponse.json(
      { error: "Judging method was already chosen for this sheet" },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseServer
    .from("comp_judge_sheets")
    .upsert(
      [
        {
          round_id: roundId,
          judge_assignment_id: assignmentId,
          status: existing?.status ?? "draft",
          judging_method: method,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "round_id,judge_assignment_id" }
    )
    .select("judging_method")
    .single();

  if (error) {
    console.error("[judging-method]", error);
    return NextResponse.json(
      { error: "Failed to save judging method" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    judging_method: data.judging_method as CallbackJudgingMethod,
  });
}
