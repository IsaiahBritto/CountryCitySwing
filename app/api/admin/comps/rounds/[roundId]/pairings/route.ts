import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  computeRotatedPairs,
  randomRotationOffset,
} from "@/lib/comps/finalsPairing";
import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  RoundDataError,
} from "@/lib/comps/roundData";

function finalsPairEntries(ctx: Awaited<ReturnType<typeof loadRoundContext>>) {
  const active = activeRoundEntries(ctx);
  const leads = active
    .filter((re) => re.checkin_role === "lead")
    .map((re) => {
      const d = entryDisplay(re);
      return { id: re.id, bibNumber: d.bibNumber, role: "lead" as const, entryId: re.entry_id };
    });
  const follows = active
    .filter((re) => re.checkin_role === "follow")
    .map((re) => {
      const d = entryDisplay(re);
      return { id: re.id, bibNumber: d.bibNumber, role: "follow" as const, entryId: re.entry_id };
    });
  return { leads, follows };
}

/** POST: save rotation offset draft or generate random for UI. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;
  const body = await req.json();

  try {
    const ctx = await loadRoundContext(roundId);
    if (
      ctx.competition.comp_type !== "jack_and_jill" ||
      ctx.round.round_type !== "final" ||
      ctx.round.pairings_confirmed_at
    ) {
      return NextResponse.json(
        { error: "Rotation applies to unconfirmed JnJ finals only" },
        { status: 409 }
      );
    }
    if (ctx.round.status !== "checkin") {
      return NextResponse.json(
        { error: "Round must be in check-in to set rotation" },
        { status: 409 }
      );
    }

    const { leads, follows } = finalsPairEntries(ctx);
    const n = leads.length;
    if (n === 0 || n !== follows.length) {
      return NextResponse.json(
        { error: "Checked-in lead and follow counts must match before rotation" },
        { status: 409 }
      );
    }

    if (body.action === "random") {
      const offset = randomRotationOffset(n);
      return NextResponse.json({ rotation_offset: offset, max: n - 1 });
    }

    const offset = Number(body.rotation_offset);
    if (!Number.isInteger(offset) || offset < 1 || offset > n - 1) {
      return NextResponse.json(
        { error: `Rotation must be an integer from 1 to ${n - 1}` },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer
      .from("comp_rounds")
      .update({
        rotation_offset: offset,
        updated_at: new Date().toISOString(),
      })
      .eq("id", roundId);
    if (error) {
      return NextResponse.json({ error: "Failed to save rotation" }, { status: 500 });
    }

    const pairs = computeRotatedPairs(leads, follows, offset);
    return NextResponse.json({
      rotation_offset: offset,
      preview: pairs.map((p) => ({
        leadBib: p.lead.bibNumber,
        followBib: p.follow.bibNumber,
      })),
    });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** GET: preview pairings for saved rotation. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;

  try {
    const ctx = await loadRoundContext(roundId);
    const offset = ctx.round.rotation_offset;
    if (offset == null) {
      return NextResponse.json({ preview: [] });
    }
    const { leads, follows } = finalsPairEntries(ctx);
    const pairs = computeRotatedPairs(leads, follows, offset);
    return NextResponse.json({
      rotation_offset: offset,
      preview: pairs.map((p) => ({
        leadBib: p.lead.bibNumber,
        followBib: p.follow.bibNumber,
      })),
    });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
