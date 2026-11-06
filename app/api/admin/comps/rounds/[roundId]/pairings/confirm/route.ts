import { NextRequest, NextResponse } from "next/server";
import { authRoundManage } from "@/lib/compApiAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { isFixedCouplePrePairingRound, resolveFinalsPairs } from "@/lib/comps/finalsPairing";
import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  RoundDataError,
} from "@/lib/comps/roundData";
import { effectiveCheckinRole } from "@/lib/comps/checkinRole";
import type { CompType } from "@/lib/comps/types";

/**
 * POST: confirm rotation or manual pairings — creates couple entries and replaces
 * individual lead/follow round entries with couple rows (dance order by lead, then follow).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const auth = await authRoundManage(req, roundId);
  if (!auth.ok) return auth.response;

  try {
    const ctx = await loadRoundContext(roundId);
    const { round, competition } = ctx;
    const compType = competition.comp_type as CompType;

    if (
      !isFixedCouplePrePairingRound(compType, {
        round_type: round.round_type,
        judged_role: round.judged_role,
        pairings_confirmed_at: round.pairings_confirmed_at,
      }) ||
      round.pairings_confirmed_at
    ) {
      return NextResponse.json(
        { error: "Can only confirm pairings for the designated pre-pairing round" },
        { status: 409 }
      );
    }
    if (round.status !== "checkin") {
      return NextResponse.json(
        { error: "Round must be in check-in to confirm pairings" },
        { status: 409 }
      );
    }

    const mode = round.pairing_mode ?? "rotation";
    if (mode === "rotation" && round.rotation_offset == null) {
      return NextResponse.json(
        { error: "Submit a rotation offset before confirming pairings" },
        { status: 409 }
      );
    }
    if (mode === "manual" && !round.manual_pairings?.length) {
      return NextResponse.json(
        { error: "Save manual pairings before confirming" },
        { status: 409 }
      );
    }

    const active = activeRoundEntries(ctx);
    const leadRows = active.filter((re) => effectiveCheckinRole(re) === "lead");
    const followRows = active.filter((re) => effectiveCheckinRole(re) === "follow");
    if (leadRows.length === 0 || followRows.length === 0) {
      return NextResponse.json(
        { error: "Need checked-in leads and follows to confirm pairings" },
        { status: 409 }
      );
    }
    if (compType !== "all_american" && leadRows.length !== followRows.length) {
      return NextResponse.json(
        { error: "Checked-in lead and follow counts must match" },
        { status: 409 }
      );
    }

    const unresolved = ctx.roundEntries.filter(
      (re) =>
        !re.scratched &&
        re.checkin_status === "pending" &&
        (effectiveCheckinRole(re) === "lead" ||
          effectiveCheckinRole(re) === "follow")
    );
    if (unresolved.length > 0) {
      return NextResponse.json(
        { error: `${unresolved.length} entries still pending check-in` },
        { status: 409 }
      );
    }

    const leadById = new Map(leadRows.map((re) => [re.id, re]));
    const followById = new Map(followRows.map((re) => [re.id, re]));

    const leads = leadRows.map((re) => ({
      id: re.id,
      bibNumber: entryDisplay(re, { competition }).bibNumber,
      role: "lead" as const,
    }));
    const follows = followRows.map((re) => ({
      id: re.id,
      bibNumber: entryDisplay(re, { competition }).bibNumber,
      role: "follow" as const,
    }));

    let pairs;
    try {
      pairs = resolveFinalsPairs(leads, follows, round, compType);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid pairings" },
        { status: 409 }
      );
    }

    const coupleRows = pairs.map((p) => {
      const leadRe = leadById.get(p.lead.id)!;
      const followRe = followById.get(p.follow.id)!;
      const leadEntry = leadRe.entry;
      const followEntry = followRe.entry;
      const judgePrimary =
        compType === "all_american" && p.judgePrimaryBib === "follow"
          ? "follow"
          : "lead";
      return {
        competition_id: competition.id,
        entry_kind: "couple" as const,
        role: null,
        lead_first_name: leadEntry.lead_first_name,
        lead_last_name: leadEntry.lead_last_name,
        lead_email: leadEntry.lead_email,
        follow_first_name: followEntry.follow_first_name,
        follow_last_name: followEntry.follow_last_name,
        follow_email: followEntry.follow_email,
        lead_bib_id: leadEntry.lead_bib_id,
        follow_bib_id: followEntry.follow_bib_id,
        source_lead_entry_id: leadEntry.id,
        source_follow_entry_id: followEntry.id,
        judge_primary_bib_role: compType === "all_american" ? judgePrimary : null,
      };
    });

    const { data: couples, error: couplesError } = await supabaseServer
      .from("comp_entries")
      .insert(coupleRows)
      .select("id");
    if (couplesError) {
      console.error("[pairings/confirm] couple insert", couplesError);
      return NextResponse.json(
        { error: "Failed to create coupled entries" },
        { status: 500 }
      );
    }

    await supabaseServer.from("comp_round_entries").delete().eq("round_id", roundId);

    const { error: seedError } = await supabaseServer
      .from("comp_round_entries")
      .insert(
        (couples ?? []).map((c, i) => ({
          round_id: roundId,
          entry_id: c.id,
          dance_order: i + 1,
          checkin_status: "checked_in",
          checkin_role: null,
        }))
      );
    if (seedError) {
      return NextResponse.json(
        { error: "Failed to seed coupled round entries" },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();
    const { data: updatedRound, error: updateError } = await supabaseServer
      .from("comp_rounds")
      .update({
        pairings_confirmed_at: now,
        updated_at: now,
      })
      .eq("id", roundId)
      .select("*")
      .single();
    if (updateError) {
      return NextResponse.json(
        { error: "Failed to confirm pairings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      round: updatedRound,
      couples: couples?.length ?? 0,
    });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
