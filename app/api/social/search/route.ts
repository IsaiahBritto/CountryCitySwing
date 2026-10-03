import { NextRequest, NextResponse } from "next/server";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { searchTracks } from "@/lib/spotify/client";
import { SpotifyQuotaBlockedError } from "@/lib/spotify/spotifyQuotaGate";
import {
  clientIpFromRequest,
  rateLimit,
} from "@/lib/spotify/rateLimit";

type SearchCacheEntry = { tracks: Awaited<ReturnType<typeof searchTracks>>; expiresAt: number };
const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit({
      key: `social-search:${ip}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many searches. Try again shortly." },
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

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ tracks: [] });
    }

    const cacheKey = q.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ tracks: cached.tracks, cached: true });
    }

    const { accessToken } = await getValidAccessToken();
    const tracks = await searchTracks(accessToken, q, { limit: 8 });
    searchCache.set(cacheKey, {
      tracks,
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    });
    return NextResponse.json({ tracks });
  } catch (error: unknown) {
    if (error instanceof SpotifyQuotaBlockedError) {
      return NextResponse.json(
        {
          error:
            "Spotify search is temporarily unavailable due to API quota limits.",
          code: "SPOTIFY_QUOTA_EXCEEDED",
        },
        { status: 503 }
      );
    }
    console.error("Social search error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to search Spotify";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
