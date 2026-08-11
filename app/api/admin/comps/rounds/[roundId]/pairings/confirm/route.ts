import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveFinalsPairs } from "@/lib/comps/finalsPairing";
import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  RoundDataError,
} from "@/lib/comps/roundData";

/**
 * POST: confirm rotation or manual pairings — creates couple entries and replaces
 * individual lead/follow round entries with couple rows (bib order by lead).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;

  try {
    const ctx = await loadRoundContext(roundId);
    const { round, competition } = ctx;

    if (
      competition.comp_type !== "jack_and_jill" ||
      round.round_type !== "final" ||
      round.pairings_confirmed_at
    ) {
      return NextResponse.json(
        { error: "Can only confirm pairings for unconfirmed JnJ finals" },
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
    const leadRows = active.filter((re) => re.checkin_role === "lead");
    const followRows = active.filter((re) => re.checkin_role === "follow");
    if (leadRows.length === 0 || followRows.length === 0) {
      return NextResponse.json(
        { error: "Need checked-in leads and follows to confirm pairings" },
        { status: 409 }
      );
    }
    if (leadRows.length !== followRows.length) {
      return NextResponse.json(
        { error: "Checked-in lead and follow counts must match" },
        { status: 409 }
      );
    }

    const unresolved = ctx.roundEntries.filter(
      (re) =>
        !re.scratched &&
        re.checkin_status === "pending" &&
        (re.checkin_role === "lead" || re.checkin_role === "follow")
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
      bibNumber: entryDisplay(re).bibNumber,
      role: "lead" as const,
    }));
    const follows = followRows.map((re) => ({
      id: re.id,
      bibNumber: entryDisplay(re).bibNumber,
      role: "follow" as const,
    }));

    let pairs;
    try {
      pairs = resolveFinalsPairs(leads, follows, round);
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
