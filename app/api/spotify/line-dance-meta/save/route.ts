import { NextRequest, NextResponse } from "next/server";
import { requireLineDanceReviewerAuth } from "@/lib/lineDanceReviewerAuth";
import { saveReviewerMeta } from "@/lib/spotify/lineDanceMeta";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireLineDanceReviewerAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      trackId?: string;
      lineDanceName?: string;
      level?: string;
      trackName?: string;
      primaryArtist?: string;
    };

    if (typeof body.trackId !== "string" || !body.trackId.trim()) {
      return NextResponse.json({ error: "trackId is required" }, { status: 400 });
    }

    const hasName = typeof body.lineDanceName === "string";
    const hasLevel = typeof body.level === "string";
    if (!hasName && !hasLevel) {
      return NextResponse.json(
        { error: "At least one of lineDanceName or level is required" },
        { status: 400 }
      );
    }

    const row = await saveReviewerMeta({
      trackId: body.trackId.trim(),
      lineDanceName: hasName ? body.lineDanceName : undefined,
      level: hasLevel ? body.level : undefined,
      trackName: typeof body.trackName === "string" ? body.trackName : null,
      primaryArtist:
        typeof body.primaryArtist === "string" ? body.primaryArtist : null,
    });

    return NextResponse.json({ meta: row });
  } catch (error: unknown) {
    console.error("Line dance save error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save line dance";
    const status =
      message === "Admin-confirmed row cannot be modified" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
