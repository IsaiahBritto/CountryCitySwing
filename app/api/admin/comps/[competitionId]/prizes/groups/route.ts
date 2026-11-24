import { NextRequest, NextResponse } from "next/server";
import { authCompetitionManage } from "@/lib/compApiAuth";
import {
  PrizeAwardsError,
  addNextPrizeGroup,
} from "@/lib/comps/prizeAwards";

/** POST: add the next finals placement group (4th, 5th, …). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const { competitionId } = await params;
  const auth = await authCompetitionManage(req, competitionId);
  if (!auth.ok) return auth.response;

  try {
    const payload = await addNextPrizeGroup(competitionId);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof PrizeAwardsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/prizes/groups] POST failed", err);
    return NextResponse.json({ error: "Failed to add placement" }, { status: 500 });
  }
}
