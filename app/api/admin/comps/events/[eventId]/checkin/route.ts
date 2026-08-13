import { NextRequest, NextResponse } from "next/server";
import { requireCompEventStaffAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { roundTitle } from "@/lib/comps/roundChain";
import {
  entryDisplay,
  loadRoundContext,
  RoundDataError,
} from "@/lib/comps/roundData";
import { sortRoundEntriesByBib } from "@/lib/comps/entrySort";
import { isJnJFinalsPrePairing } from "@/lib/comps/finalsPairing";
import {
  isFollowCheckinEntry,
  isLeadCheckinEntry,
} from "@/lib/comps/checkinRole";
import { repairPromotedAlternateRoles } from "@/lib/comps/promoteAlternate";

/** GET: check-in view for all divisions on this event (staff-safe payload). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireCompEventStaffAuth(req, eventId);
  if (!auth.ok) return auth.response;

  const { data: event } = await supabaseServer
    .from("events")
    .select("id, title, starts_at, ends_at, time_zone, type")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: competitions } = await supabaseServer
    .from("competitions")
    .select("id, name, comp_type")
    .eq("event_id", eventId)
    .order("name");

  const divisions: {
    competitionId: string;
    name: string;
    compType: string;
    rounds: {
      roundId: string;
      roundType: string;
      judgedRole: string | null;
      status: string;
      sourceRoundId: string | null;
      prePairing: boolean;
      leadPresent: number;
      followPresent: number;
      leadUnresolved: number;
      followUnresolved: number;
      unresolvedCheckin: number;
      presentCount: number;
      entries: {
        id: string;
        checkin_status: string;
        checkin_role: string | null;
        display: {
          bibNumber: number | null;
          displayName: string;
        };
      }[];
    }[];
  }[] = [];

  for (const comp of competitions ?? []) {
    const { data: rounds } = await supabaseServer
      .from("comp_rounds")
      .select(
        "id, round_type, judged_role, status, source_round_id, pairings_confirmed_at"
      )
      .eq("competition_id", comp.id)
      .eq("status", "checkin")
      .order("round_order");

    const roundPayloads = [];
    for (const round of rounds ?? []) {
      try {
        await repairPromotedAlternateRoles(round.id);
        const ctx = await loadRoundContext(round.id);
        const prePairing =
          comp.comp_type === "jack_and_jill" &&
          isJnJFinalsPrePairing({
            round_type: round.round_type,
            judged_role: round.judged_role,
            pairings_confirmed_at: round.pairings_confirmed_at,
          });

        const sorted = sortRoundEntriesByBib(
          ctx.roundEntries.map((re) => ({
            id: re.id,
            heat_id: re.heat_id,
            dance_order: re.dance_order,
            checkin_status: re.checkin_status,
            checkin_role: re.checkin_role,
            scratched: re.scratched,
            promoted_alternate: re.promoted_alternate,
            entry: re.entry,
            display: entryDisplay(re),
          }))
        );

        const active = sorted.filter((e) => !e.scratched);
        const leadEntries = prePairing
          ? active.filter(isLeadCheckinEntry)
          : [];
        const followEntries = prePairing
          ? active.filter(isFollowCheckinEntry)
          : [];

        roundPayloads.push({
          roundId: round.id,
          roundType: round.round_type,
          judgedRole: round.judged_role,
          status: round.status,
          sourceRoundId: round.source_round_id,
          prePairing,
          leadPresent: leadEntries.filter((e) => e.checkin_status === "checked_in")
            .length,
          followPresent: followEntries.filter((e) => e.checkin_status === "checked_in")
            .length,
          leadUnresolved: leadEntries.filter((e) => e.checkin_status === "pending")
            .length,
          followUnresolved: followEntries.filter((e) => e.checkin_status === "pending")
            .length,
          unresolvedCheckin: active.filter((e) => e.checkin_status === "pending")
            .length,
          presentCount: active.filter((e) => e.checkin_status === "checked_in").length,
          entries: active.map((e) => ({
            id: e.id,
            checkin_status: e.checkin_status,
            checkin_role: e.checkin_role,
            promoted_alternate: e.promoted_alternate,
            display: {
              bibNumber: e.display.bibNumber,
              displayName: e.display.displayName,
            },
          })),
        });
      } catch (err) {
        if (err instanceof RoundDataError) continue;
        throw err;
      }
    }

    if (roundPayloads.length > 0) {
      divisions.push({
        competitionId: comp.id,
        name: comp.name,
        compType: comp.comp_type,
        rounds: roundPayloads,
      });
    }
  }

  return NextResponse.json({ event, divisions });
}
