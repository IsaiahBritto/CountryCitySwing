import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  PrizeAwardsError,
  buildPrizesPayload,
  savePrizesPatch,
  type PrizeGroupPatchPayload,
} from "@/lib/comps/prizeAwards";

/** GET: prize groups/recipients/items; auto-seeds top 3 when empty. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  try {
    const payload = await buildPrizesPayload(competitionId);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof PrizeAwardsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/prizes] GET failed", err);
    return NextResponse.json({ error: "Failed to load prizes" }, { status: 500 });
  }
}

/** PATCH: save shared prizes, emails, and prize item rows. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const body = await req.json().catch(() => ({}));
  const groups = (body.groups ?? []) as PrizeGroupPatchPayload[];

  try {
    const payload = await savePrizesPatch(competitionId, groups);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof PrizeAwardsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/comps/prizes] PATCH failed", err);
    return NextResponse.json({ error: "Failed to save prizes" }, { status: 500 });
  }
}
