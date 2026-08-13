import { NextRequest, NextResponse } from "next/server";
import { requireCompCheckinAuth } from "@/lib/compStaffAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  promoteNextAlternate,
  PromoteAlternateError,
} from "@/lib/comps/promoteAlternate";
import { canEditCheckin } from "@/lib/comps/roundState";
import type { DanceRole, RoundStatus } from "@/lib/comps/types";

/**
 * POST: round check-in actions.
 * - { round_entry_id, checkin_status } marks an entry checked_in / absent /
 *   pending (the green check / red X screen).
 * - { action: "promote_alternate", role?: "lead"|"follow" } adds the next
 *   available alternate from the source round (required role on JnJ finals).
 * - { round_entry_id, scratched } scratches/unscratches an entry.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const auth = await requireCompCheckinAuth(req, roundId);
  if (!auth.ok) return auth.response;

  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || !canEditCheckin(round.status as RoundStatus)) {
    return NextResponse.json(
      {
        error:
          "Check-in is closed while scoring is open. Backtrack the round to check-in to make changes.",
      },
      { status: 409 }
    );
  }

  const body = await req.json();

  if (body.action === "promote_alternate") {
    const role =
      body.role === "lead" || body.role === "follow"
        ? (body.role as DanceRole)
        : undefined;
    try {
      const promoted = await promoteNextAlternate(roundId, role);
      return NextResponse.json({ promoted });
    } catch (err) {
      if (err instanceof PromoteAlternateError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  }

  const roundEntryId = body.round_entry_id;
  if (!roundEntryId) {
    return NextResponse.json(
      { error: "round_entry_id is required" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};
  if (["pending", "checked_in", "absent"].includes(body.checkin_status)) {
    update.checkin_status = body.checkin_status;
  }
  if (typeof body.scratched === "boolean") {
    update.scratched = body.scratched;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("comp_round_entries")
    .update(update)
    .eq("id", roundEntryId)
    .eq("round_id", roundId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "Failed to update check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({ roundEntry: data });
}
