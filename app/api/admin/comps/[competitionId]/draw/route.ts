import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import type { RoundSlotRef } from "@/lib/comps/roundChain";
import {
  JnJFinalsSeedError,
  seedJnJFinalsFromAdvancers,
} from "@/lib/comps/roundSeed";

/**
 * POST: JnJ finals seeding from advancers (legacy/manual API).
 * Auto-resolution uses the previous enabled callback slot when round ids
 * are omitted. Prefer Begin check-in on the finals round in normal use.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json().catch(() => ({}));
  const leadRoundId = body.lead_round_id as string | undefined;
  const followRoundId = body.follow_round_id as string | undefined;

  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, comp_type")
    .eq("id", competitionId)
    .maybeSingle();
  if (!competition) {
    return NextResponse.json({ error: "Competition not found" }, { status: 404 });
  }
  if (competition.comp_type !== "jack_and_jill") {
    return NextResponse.json(
      { error: "Finals seeding only applies to Jack & Jill" },
      { status: 400 }
    );
  }

  const { data: existingFinal } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("competition_id", competitionId)
    .eq("round_type", "final")
    .is("judged_role", null)
    .maybeSingle();

  if (!existingFinal) {
    return NextResponse.json(
      { error: "Enable the Final round before seeding advancers" },
      { status: 409 }
    );
  }
  if (existingFinal.status !== "pending" && existingFinal.status !== "checkin") {
    return NextResponse.json(
      { error: "Finals have already started" },
      { status: 409 }
    );
  }

  const { data: allRoundsData } = await supabaseServer
    .from("comp_rounds")
    .select("id, round_type, judged_role, status, round_order")
    .eq("competition_id", competitionId);
  const allRounds = (allRoundsData ?? []) as RoundSlotRef[];

  try {
    const result = await seedJnJFinalsFromAdvancers(
      competitionId,
      existingFinal.id,
      allRounds,
      leadRoundId && followRoundId
        ? { leadRoundId, followRoundId }
        : undefined
    );

    const { data: round } = await supabaseServer
      .from("comp_rounds")
      .select("*")
      .eq("id", existingFinal.id)
      .single();

    return NextResponse.json({
      round,
      leads: result.leads,
      follows: result.follows,
    });
  } catch (err) {
    if (err instanceof JnJFinalsSeedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[admin/comps/draw]", err);
    return NextResponse.json(
      { error: "Failed to seed finals entries" },
      { status: 500 }
    );
  }
}
