import { NextRequest, NextResponse } from "next/server";
import { requireLineDanceReviewerAuth } from "@/lib/lineDanceReviewerAuth";
import { listAllFromMaster } from "@/lib/spotify/lineDanceMeta";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireLineDanceReviewerAuth(req);
    if (!auth.ok) return auth.response;

    const sync =
      req.nextUrl.searchParams.get("sync") === "1" ||
      req.nextUrl.searchParams.get("sync") === "true";

    const result = await listAllFromMaster({ sync });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Line dance review list error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list line dances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
