import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  fetchPlaylistMeta,
  fetchPlaylistTracks,
} from "@/lib/spotify/client";
import { enrichDeckTracks } from "@/lib/spotify/deckTracks";
import { parseSpotifyPlaylistId } from "@/lib/spotify/playlistIds";
import { SpotifyQuotaBlockedError } from "@/lib/spotify/spotifyQuotaGate";
import {
  jsonWithSpotifyMeta,
  spotifyBffErrorResponse,
  spotifyStaleMeta,
} from "@/lib/spotify/spotifyBffResponse";
import {
  readPlaylistTracksCache,
  writePlaylistTracksCache,
  recordCacheHit,
} from "@/lib/spotify/spotifyServerCache";

type RouteContext = { params: Promise<{ playlistId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { playlistId: rawId } = await context.params;
    const playlistId = parseSpotifyPlaylistId(rawId);
    if (!playlistId) {
      return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
    }

    const meta = await spotifyStaleMeta();
    const { accessToken } = await getValidAccessToken();

    try {
      let tracks;
      try {
        tracks = await fetchPlaylistTracks(accessToken, playlistId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/\(404\)/.test(message)) {
          return NextResponse.json(
            { error: "Playlist not found or not accessible" },
            { status: 404 }
          );
        }
        throw err;
      }

      const enriched = await enrichDeckTracks(tracks);
      const totalDurationMs = enriched.reduce((sum, t) => sum + t.durationMs, 0);

      let snapshotId: string | null = null;
      try {
        const playlistMeta = await fetchPlaylistMeta(accessToken, playlistId);
        snapshotId = playlistMeta.snapshotId;
      } catch {
        // optional
      }

      await writePlaylistTracksCache({
        playlistId,
        snapshotId,
        tracks,
        totalDurationMs,
      });

      return jsonWithSpotifyMeta(
        {
          playlistId,
          tracks: enriched,
          totalDurationMs,
        },
        { stale: false, quotaBlockedUntil: meta.quotaBlockedUntil }
      );
    } catch (error: unknown) {
      if (error instanceof SpotifyQuotaBlockedError) {
        const cached = await readPlaylistTracksCache(playlistId);
        if (cached?.tracks.length) {
          await recordCacheHit("playlist_tracks");
          const enriched = await enrichDeckTracks(cached.tracks);
          const totalDurationMs = enriched.reduce(
            (sum, t) => sum + t.durationMs,
            0
          );
          return jsonWithSpotifyMeta(
            {
              playlistId,
              tracks: enriched,
              totalDurationMs,
              warning:
                "Spotify sync paused — showing last cached playlist tracks.",
            },
            {
              stale: true,
              quotaBlockedUntil:
                meta.quotaBlockedUntil ?? error.blockedUntil.toISOString(),
            }
          );
        }
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error("Spotify playlist tracks error:", error);
    return spotifyBffErrorResponse(error, "Failed to load playlist tracks");
  }
}
