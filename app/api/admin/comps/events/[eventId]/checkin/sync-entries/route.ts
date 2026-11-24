import { NextRequest, NextResponse } from "next/server";
import { requireCompEventStaffAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { syncAllCompEntriesToOpenRounds } from "@/lib/comps/roundEntryAttach";

/**
 * POST: idempotent backfill for every division on this event — attach comp_entries
 * to open first-slot rounds. Site admins only (check-in staff cannot trigger).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth.response;

  if (auth.access !== "admin") {
    return NextResponse.json(
      { error: "Only site admins can sync entries to check-in" },
      { status: 403 }
    );
  }

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch {
    /* empty body ok */
  }

  const { data: competitions, error: compErr } = await supabaseServer
    .from("competitions")
    .select("id, name")
    .eq("event_id", eventId)
    .order("name");

  if (compErr) {
    return NextResponse.json(
      { error: "Failed to load competitions" },
      { status: 500 }
    );
  }

  const byCompetition: {
    competitionId: string;
    name: string;
    attachedCount: number;
    byRound: Record<string, number>;
  }[] = [];
  let attachedCount = 0;

  for (const comp of competitions ?? []) {
    try {
      const result = await syncAllCompEntriesToOpenRounds(comp.id, { dryRun });
      byCompetition.push({
        competitionId: comp.id,
        name: comp.name,
        attachedCount: result.attachedCount,
        byRound: result.byRound,
      });
      attachedCount += result.attachedCount;
    } catch (err) {
      console.error(
        "[checkin/sync-entries] failed for competition",
        comp.id,
        err
      );
      return NextResponse.json(
        { error: `Failed to sync division “${comp.name}”` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    attachedCount,
    dryRun,
    byCompetition,
  });
}