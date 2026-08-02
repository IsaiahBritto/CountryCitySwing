import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * GET: public results for one competition — published rounds only, rendered
 * from the stored tabulation snapshot (never a live recompute).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const { competitionId } = await params;

  const { data: competition, error } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type, event:events(id, title, starts_at, location)")
    .eq("id", competitionId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load competition" }, { status: 500 });
  }
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  const { data: rounds, error: roundsError } = await supabaseServer
    .from("comp_rounds")
    .select(
      "id, round_type, judged_role, scoring_mode, callback_count, alternate_count, round_order, tabulation, published_at"
    )
    .eq("competition_id", competitionId)
    .eq("status", "published")
    .order("round_order", { ascending: true });
  if (roundsError) {
    return NextResponse.json({ error: "Failed to load rounds" }, { status: 500 });
  }

  return NextResponse.json({ competition, rounds: rounds ?? [] });
}
