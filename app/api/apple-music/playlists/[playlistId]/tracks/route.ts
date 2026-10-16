import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { fetchLibraryPlaylistTracks } from "@/lib/appleMusic/client";
import { getCachedAppleDeveloperToken } from "@/lib/appleMusic/developerToken";
import { musicUserTokenFromRequest } from "@/lib/appleMusic/requestHeaders";
import {
  readApplePlaylistTracksCache,
  writeApplePlaylistTracksCache,
} from "@/lib/appleMusic/serverCache";
import { enrichDeckTracks } from "@/lib/music/deckTracks";
import { MusicApiFetchError } from "@/lib/music/apiDiagnostics";

type RouteContext = { params: Promise<{ playlistId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    let musicUserToken = musicUserTokenFromRequest(req);
    if (!musicUserToken) {
      const { getStoredAppleMusicUserToken } = await import(
        "@/lib/appleMusic/sessionCredentials"
      );
      musicUserToken = (await getStoredAppleMusicUserToken())?.musicUserToken ?? null;
    }
    if (!musicUserToken) {
      return NextResponse.json(
        {
          error:
            "Apple Music user authorization required. Connect on the DJ deck first.",
        },
        { status: 401 }
      );
    }

    const { playlistId } = await context.params;
    const force = req.nextUrl.searchParams.get("force") === "1";
    if (!force) {
      const cached = await readApplePlaylistTracksCache(playlistId);
      if (cached) {
        const tracks = await enrichDeckTracks(cached.tracks);
        return NextResponse.json({
          tracks,
          totalDurationMs: cached.totalDurationMs,
          stale: false,
          cachedAt: cached.fetchedAt,
        });
      }
    }

    const { token } = getCachedAppleDeveloperToken();
    const { tracks, totalDurationMs } = await fetchLibraryPlaylistTracks({
      developerToken: token,
      musicUserToken,
      playlistId,
    });
    await writeApplePlaylistTracksCache({
      playlistId,
      tracks,
      totalDurationMs,
    });
    const enriched = await enrichDeckTracks(tracks);

    return NextResponse.json({ tracks: enriched, totalDurationMs, stale: false });
  } catch (error: unknown) {
    if (error instanceof MusicApiFetchError && error.isRateLimited) {
      return NextResponse.json(
        {
          error: error.message,
          retryAfterSec: error.retryAfterSec,
        },
        { status: 429 }
      );
    }
    console.error("Apple Music playlist tracks error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playlist tracks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
