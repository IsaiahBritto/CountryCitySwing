import { NextRequest, NextResponse } from "next/server";
import { loadPublicCompetitionResults } from "@/lib/comps/loadPublicCompetitionResults";
import { publicSlugForCommunityEventId } from "@/lib/nonCcsEventService";

/**
 * GET: public results for one CCS competition — published rounds only.
 * Community (non-CCS) competitions use /api/non-ccs-events/competitions/:id/results.
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
  if (host === "community") {
    const eventId = result.data.competition.event?.id;
    const slug = eventId ? await publicSlugForCommunityEventId(eventId) : null;
    return NextResponse.json(
      {
        error: "Competition not found",
        nonCcsRedirect:
          slug != null
            ? `/non-ccs-events/${encodeURIComponent(slug)}/competitions/${competitionId}`
            : null,
      },
      { status: 404 }
    );
  }

  return NextResponse.json(result.data);
}
