import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  isLineDanceLevel,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";
import { confirmAsAdmin } from "@/lib/spotify/lineDanceMeta";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      trackId?: string;
      lineDanceName?: string;
      level?: string;
      levelRaw?: string;
      trackName?: string;
      primaryArtist?: string;
    };

    if (
      typeof body.trackId !== "string" ||
      !body.trackId.trim() ||
      typeof body.lineDanceName !== "string" ||
      !body.lineDanceName.trim() ||
      typeof body.level !== "string"
    ) {
      return NextResponse.json(
        { error: "trackId, lineDanceName, and level are required" },
        { status: 400 }
      );
    }

    if (!isLineDanceLevel(body.level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    const row = await confirmAsAdmin({
      trackId: body.trackId.trim(),
      lineDanceName: body.lineDanceName.trim(),
      level: body.level as LineDanceLevel,
      levelRaw: body.levelRaw ?? body.level,
      trackName: typeof body.trackName === "string" ? body.trackName : null,
      primaryArtist:
        typeof body.primaryArtist === "string" ? body.primaryArtist : null,
    });

    return NextResponse.json({ meta: row });
  } catch (error: unknown) {
    console.error("Line dance confirm error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to confirm line dance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
