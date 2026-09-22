import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { rebuildMasterGenreIndexFromSpotify } from "@/lib/spotify/masterGenreDb";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const result = await rebuildMasterGenreIndexFromSpotify();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Master index rebuild failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
