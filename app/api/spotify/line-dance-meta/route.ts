import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { listUnassociatedFromMaster } from "@/lib/spotify/lineDanceMeta";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
    const result = await listUnassociatedFromMaster({
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Line dance meta list error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list line dances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
