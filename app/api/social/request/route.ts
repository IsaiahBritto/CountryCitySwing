import { NextRequest, NextResponse } from "next/server";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { getOptionalUser } from "@/lib/optionalAuth";
import {
  clientIpFromRequest,
  rateLimit,
} from "@/lib/spotify/rateLimit";
import {
  SocialRequestError,
  submitSocialSongRequest,
} from "@/lib/spotify/socialRequest";
import { readSocialRequesterCookie } from "@/lib/spotify/socialRequesterCookie";
import { verifyTurnstileToken } from "@/lib/turnstile";

const GENRES = new Set<GenrePool>(["cs", "wcs", "ld", "ts"]);

export async function POST(req: NextRequest) {
  try {
    const user = await getOptionalUser(req);
    const ip = clientIpFromRequest(req);

    if (!user) {
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
    }

    const body = (await req.json().catch(() => ({}))) as {
      trackId?: string;
      uri?: string;
      name?: string;
      primaryArtist?: string;
      genre?: string;
      lineDanceName?: string;
      lineDanceLevel?: string;
      turnstileToken?: string;
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
        { error: "genre must be cs, wcs, ld, or ts" },
        { status: 400 }
      );
    }

    if (!user) {
      if (!body.turnstileToken) {
        return NextResponse.json({ error: "Captcha required" }, { status: 403 });
      }
      const { success } = await verifyTurnstileToken(body.turnstileToken, ip);
      if (!success) {
        return NextResponse.json(
          { error: "Captcha verification failed" },
          { status: 403 }
        );
      }
    }

    const requesterToken = user ? null : readSocialRequesterCookie(req);
    if (!user && !requesterToken) {
      return NextResponse.json(
        { error: "Session required. Refresh the page and try again." },
        { status: 403 }
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
      requesterUserId: user?.id ?? null,
      requesterToken,
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
