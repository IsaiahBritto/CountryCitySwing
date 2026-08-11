import { NextRequest, NextResponse } from "next/server";
import { requireCompCheckinAuth } from "@/lib/compStaffAuth";
import { refreshRoundHeatsIfConfigured } from "@/lib/comps/heatSetup";

/** POST: re-assign heats from current check-in counts (lead + follow sibling when configured). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const auth = await requireCompCheckinAuth(req, roundId);
  if (!auth.ok) return auth.response;

  const result = await refreshRoundHeatsIfConfigured(roundId);
  return NextResponse.json({ refreshed: result != null });
}
