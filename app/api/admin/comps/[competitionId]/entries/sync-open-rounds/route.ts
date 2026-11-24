import { NextRequest, NextResponse } from "next/server";
import { authCompetitionManage } from "@/lib/compApiAuth";
import { syncAllCompEntriesToOpenRounds } from "@/lib/comps/roundEntryAttach";

/**
 * POST: idempotent backfill — attach every comp_entry to eligible open first-slot
 * rounds (pending/checkin). Safe during live check-in; use dry_run to preview.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const { competitionId } = await params;
  const auth = await authCompetitionManage(req, competitionId);
  if (!auth.ok) return auth.response;

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch {
    /* empty body ok */
  }

  try {
    const result = await syncAllCompEntriesToOpenRounds(competitionId, {
      dryRun,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin/comps/entries/sync-open-rounds] failed", err);
    return NextResponse.json(
      { error: "Failed to sync entries to open rounds" },
      { status: 500 }
    );
  }
}