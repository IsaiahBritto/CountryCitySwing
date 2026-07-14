import { NextRequest, NextResponse } from "next/server";
import {
  getActivePlaylistStatus,
  lookupTrackGenreInMasters,
} from "@/lib/spotify/activePlaylist";
import {
  clientIpFromRequest,
  rateLimit,
} from "@/lib/spotify/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit({
      key: `social-lookup:${ip}`,
      limit: 40,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        }
      );
    }

    const status = await getActivePlaylistStatus();
    if (!status.isActive) {
      return NextResponse.json(
        { error: "Song requests aren’t open right now." },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      trackId?: string;
    };
    if (typeof body.trackId !== "string" || !body.trackId.trim()) {
      return NextResponse.json(
        { error: "trackId is required" },
        { status: 400 }
      );
    }

    const genre = await lookupTrackGenreInMasters(body.trackId.trim());
    return NextResponse.json({ genre });
  } catch (error: unknown) {
    console.error("Social lookup-genre error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to look up genre";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
