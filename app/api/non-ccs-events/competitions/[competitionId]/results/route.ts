import { NextRequest, NextResponse } from "next/server";
import { loadPublicCompetitionResults } from "@/lib/comps/loadPublicCompetitionResults";

/**
 * GET: public results for a community (non-CCS) competition.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const { competitionId } = await params;
  const result = await loadPublicCompetitionResults(req, competitionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const host = result.data.competition.event?.host_kind ?? "ccs";
  if (host !== "community") {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }

  return NextResponse.json(result.data);
}