import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminOrChiefJudgeAuth } from "@/lib/judgeAuth";
import { canTransition } from "@/lib/comps/roundState";

async function loadRound(roundId: string) {
  const { data } = await supabaseServer
    .from("comp_rounds")
    .select("id, competition_id, status")
    .eq("id", roundId)
    .maybeSingle();
  return data;
}

/** POST: publish a tabulated round's results publicly. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const round = await loadRound(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, round.competition_id);
  if (!auth.ok) return auth.response;

  if (!canTransition(round.status as any, "published")) {
    return NextResponse.json(
      { error: `Only tabulated rounds can be published (currently ${round.status})` },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("comp_rounds")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);
  if (error) {
    return NextResponse.json({ error: "Failed to publish" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/** DELETE: unpublish (back to tabulated). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const round = await loadRound(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const auth = await requireAdminOrChiefJudgeAuth(req, round.competition_id);
  if (!auth.ok) return auth.response;

  if (round.status !== "published") {
    return NextResponse.json(
      { error: "Round is not published" },
      { status: 409 }
    );
  }

  const { error } = await supabaseServer
    .from("comp_rounds")
    .update({
      status: "tabulated",
      published_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId);
  if (error) {
    return NextResponse.json({ error: "Failed to unpublish" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
