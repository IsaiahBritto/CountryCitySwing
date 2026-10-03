import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { ensureMockCompetitionPair } from "@/lib/comps/scoringTest/seedFixtures";

/** POST: create or refresh admin-only JnJ + Strictly sandbox (30/30/30 entries). */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const seedEntries = body.seed_entries !== false;
  const ensureJudges = body.ensure_judges !== false;
  const resetRounds = body.reset_rounds === true;

  try {
    const result = await ensureMockCompetitionPair({
      seedEntries,
      ensureJudges,
      resetRounds,
    });

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      strictly: {
        id: result.strictly.id,
        name: result.strictly.name,
        adminUrl: `/admin/comps/${result.strictly.id}`,
      },
      jnj: {
        id: result.jnj.id,
        name: result.jnj.name,
        adminUrl: `/admin/comps/${result.jnj.id}`,
      },
      counts: result.counts,
    });
  } catch (err) {
    console.error("[ensure-test-fixtures]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to ensure test fixtures",
      },
      { status: 500 }
    );
  }
}
