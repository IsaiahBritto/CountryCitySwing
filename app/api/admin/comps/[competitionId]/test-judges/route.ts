import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  ensureJnJJudges,
  ensureStrictlyJudges,
} from "@/lib/comps/scoringTest/seedInfrastructure";

/** POST: ensure fixture judges are assigned to a test competition. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const { data: competition, error } = await supabaseServer
    .from("competitions")
    .select("id, comp_type, test_comp")
    .eq("id", competitionId)
    .maybeSingle();

  if (error || !competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  if (!competition.test_comp) {
    return NextResponse.json(
      { error: "Ensure judges is only for test competitions" },
      { status: 400 }
    );
  }

  try {
    if (competition.comp_type === "strictly") {
      await ensureStrictlyJudges(competitionId);
    } else {
      await ensureJnJJudges(competitionId);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[test-judges]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to ensure judges" },
      { status: 500 }
    );
  }
}
