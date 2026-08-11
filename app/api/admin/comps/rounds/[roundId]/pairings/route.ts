import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  computeRotatedPairs,
  pairingsReady,
  randomRotationOffset,
  resolveFinalsPairs,
  validateManualPairings,
} from "@/lib/comps/finalsPairing";
import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  RoundDataError,
} from "@/lib/comps/roundData";
import type { ManualPairingRow, PairingMode } from "@/lib/comps/types";

function finalsPairEntries(ctx: Awaited<ReturnType<typeof loadRoundContext>>) {
  const active = activeRoundEntries(ctx);
  const leads = active
    .filter((re) => re.checkin_role === "lead")
    .map((re) => {
      const d = entryDisplay(re);
      return {
        id: re.id,
        bibNumber: d.bibNumber,
        role: "lead" as const,
        entryId: re.entry_id,
        displayName: d.displayName,
      };
    });
  const follows = active
    .filter((re) => re.checkin_role === "follow")
    .map((re) => {
      const d = entryDisplay(re);
      return {
        id: re.id,
        bibNumber: d.bibNumber,
        role: "follow" as const,
        entryId: re.entry_id,
        displayName: d.displayName,
      };
    });
  return { leads, follows };
}

function previewFromPairs(
  pairs: { lead: { bibNumber: number | null }; follow: { bibNumber: number | null } }[]
) {
  return pairs.map((p) => ({
    leadBib: p.lead.bibNumber,
    followBib: p.follow.bibNumber,
  }));
}

function pairingPayload(ctx: Awaited<ReturnType<typeof loadRoundContext>>) {
  const { leads, follows } = finalsPairEntries(ctx);
  const round = ctx.round;
  const mode = (round.pairing_mode ?? "rotation") as PairingMode;
  let preview: { leadBib: number | null; followBib: number | null }[] = [];
  if (pairingsReady(round)) {
    try {
      const pairs = resolveFinalsPairs(leads, follows, round);
      preview = previewFromPairs(pairs);
    } catch {
      preview = [];
    }
  }
  return {
    pairing_mode: mode,
    rotation_offset: round.rotation_offset,
    manual_pairings: round.manual_pairings,
    preview,
    leads: leads.map((l) => ({
      roundEntryId: l.id,
      bibNumber: l.bibNumber,
      displayName: l.displayName,
    })),
    follows: follows.map((f) => ({
      roundEntryId: f.id,
      bibNumber: f.bibNumber,
      displayName: f.displayName,
    })),
  };
}

async function assertPrePairingRound(roundId: string) {
  const ctx = await loadRoundContext(roundId);
  if (
    ctx.competition.comp_type !== "jack_and_jill" ||
    ctx.round.round_type !== "final" ||
    ctx.round.pairings_confirmed_at
  ) {
    return {
      error: NextResponse.json(
        { error: "Pairings apply to unconfirmed JnJ finals only" },
        { status: 409 }
      ),
    };
  }
  if (ctx.round.status !== "checkin") {
    return {
      error: NextResponse.json(
        { error: "Round must be in check-in to set pairings" },
        { status: 409 }
      ),
    };
  }
  return { ctx };
}

/** POST: save rotation offset, manual pairings, or switch pairing mode. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;
  const body = await req.json();

  try {
    const gate = await assertPrePairingRound(roundId);
    if ("error" in gate) return gate.error;
    const { ctx } = gate;
    const { leads, follows } = finalsPairEntries(ctx);
    const n = leads.length;
    if (n === 0 || n !== follows.length) {
      return NextResponse.json(
        { error: "Checked-in lead and follow counts must match before pairing" },
        { status: 409 }
      );
    }

    if (body.action === "set_mode") {
      const mode = body.pairing_mode as PairingMode;
      if (mode !== "rotation" && mode !== "manual") {
        return NextResponse.json(
          { error: "pairing_mode must be rotation or manual" },
          { status: 400 }
        );
      }
      const update =
        mode === "manual"
          ? {
              pairing_mode: "manual",
              rotation_offset: null,
              updated_at: new Date().toISOString(),
            }
          : {
              pairing_mode: "rotation",
              manual_pairings: null,
              updated_at: new Date().toISOString(),
            };
      const { error } = await supabaseServer
        .from("comp_rounds")
        .update(update)
        .eq("id", roundId);
      if (error) {
        return NextResponse.json({ error: "Failed to set pairing mode" }, { status: 500 });
      }
      const nextCtx = await loadRoundContext(roundId);
      return NextResponse.json(pairingPayload(nextCtx));
    }

    if (body.action === "save_manual") {
      const pairs = (body.pairs ?? []) as ManualPairingRow[];
      const validation = validateManualPairings(leads, follows, pairs);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const { error } = await supabaseServer
        .from("comp_rounds")
        .update({
          pairing_mode: "manual",
          manual_pairings: pairs,
          rotation_offset: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", roundId);
      if (error) {
        return NextResponse.json(
          { error: "Failed to save manual pairings" },
          { status: 500 }
        );
      }
      const savedPairs = resolveFinalsPairs(leads, follows, {
        pairing_mode: "manual",
        rotation_offset: null,
        manual_pairings: pairs,
      });
      return NextResponse.json({
        pairing_mode: "manual",
        manual_pairings: pairs,
        preview: previewFromPairs(savedPairs),
      });
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
        pairing_mode: "rotation",
        rotation_offset: offset,
        manual_pairings: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", roundId);
    if (error) {
      return NextResponse.json({ error: "Failed to save rotation" }, { status: 500 });
    }

    const pairs = computeRotatedPairs(leads, follows, offset);
    return NextResponse.json({
      pairing_mode: "rotation",
      rotation_offset: offset,
      preview: previewFromPairs(pairs),
    });
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** GET: preview pairings for saved rotation or manual mapping. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;

  try {
    const ctx = await loadRoundContext(roundId);
    return NextResponse.json(pairingPayload(ctx));
  } catch (err) {
    if (err instanceof RoundDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
