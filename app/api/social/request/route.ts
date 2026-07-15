import { NextRequest, NextResponse } from "next/server";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import {
  clientIpFromRequest,
  rateLimit,
} from "@/lib/spotify/rateLimit";
import {
  SocialRequestError,
  submitSocialSongRequest,
} from "@/lib/spotify/socialRequest";

const GENRES = new Set<GenrePool>(["cs", "wcs", "ld"]);

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit({
      key: `social-request:${ip}`,
      limit: 20,
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

    const body = (await req.json().catch(() => ({}))) as {
      trackId?: string;
      uri?: string;
      name?: string;
      primaryArtist?: string;
      genre?: string;
      lineDanceName?: string;
      lineDanceLevel?: string;
    };

    if (
      typeof body.trackId !== "string" ||
      typeof body.uri !== "string" ||
      typeof body.name !== "string" ||
      typeof body.primaryArtist !== "string" ||
      typeof body.genre !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "trackId, uri, name, primaryArtist, and genre are required",
        },
        { status: 400 }
      );
    }

    const genre = body.genre.trim() as GenrePool;
    if (!GENRES.has(genre)) {
      return NextResponse.json(
        { error: "genre must be cs, wcs, or ld" },
        { status: 400 }
      );
    }

    const result = await submitSocialSongRequest({
      trackId: body.trackId.trim(),
      uri: body.uri.trim(),
      name: body.name.trim(),
      primaryArtist: body.primaryArtist.trim(),
      genre,
      lineDanceName:
        typeof body.lineDanceName === "string" ? body.lineDanceName : null,
      lineDanceLevel:
        typeof body.lineDanceLevel === "string" ? body.lineDanceLevel : null,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof SocialRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Social request error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to submit request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
