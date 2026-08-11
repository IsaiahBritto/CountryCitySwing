import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { MAX_FLOOR_COUPLES_REQUIRED, setupRoundHeats } from "@/lib/comps/heatSetup";

/** POST: assign entries to heats in bib order (deterministic). Body: { heat_count?: number | null } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { roundId } = await params;

  const { supabaseServer } = await import("@/lib/supabaseServer");
  const { data: round } = await supabaseServer
    .from("comp_rounds")
    .select("id, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (!["pending", "checkin"].includes(round.status)) {
    return NextResponse.json(
      { error: "Heats can only be changed before scoring opens" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const heatCountOverride =
    body.heat_count === undefined
      ? undefined
      : body.heat_count == null
        ? null
        : Math.max(1, Number(body.heat_count) || 1);

  try {
    const { heats, assigned, plan } = await setupRoundHeats(
      roundId,
      heatCountOverride
    );
    return NextResponse.json({
      heats,
      assigned,
      heatCount: plan.heatCount,
      heatSizes: plan.heatSizes,
      couplesPerHeat: plan.couplesPerHeat,
      heatReturnCount: plan.heatReturnCount,
      heatReturnRole: plan.heatReturnRole,
      autoHeatCount: plan.autoHeatCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to setup heats";
    const status =
      message === "Round not found"
        ? 404
        : message === "No entries to assign"
          ? 409
          : message === MAX_FLOOR_COUPLES_REQUIRED
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
