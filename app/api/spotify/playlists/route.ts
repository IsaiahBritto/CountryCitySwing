import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { listOwnedPlaylists } from "@/lib/spotify/client";
import { SpotifyQuotaBlockedError } from "@/lib/spotify/spotifyQuotaGate";
import {
  jsonWithSpotifyMeta,
  spotifyBffErrorResponse,
  spotifyStaleMeta,
} from "@/lib/spotify/spotifyBffResponse";
import {
  readOwnedPlaylistsCache,
  writeOwnedPlaylistsCache,
  recordCacheHit,
} from "@/lib/spotify/spotifyServerCache";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const meta = await spotifyStaleMeta();
    const { accessToken, spotifyUserId } = await getValidAccessToken();

    try {
      const playlists = await listOwnedPlaylists(accessToken, spotifyUserId, {
        limit: 100,
      });
      await writeOwnedPlaylistsCache({ spotifyUserId, playlists });

      return jsonWithSpotifyMeta(
        {
          spotifyUserId,
          playlists,
        },
        { stale: false, quotaBlockedUntil: meta.quotaBlockedUntil }
      );
    } catch (error: unknown) {
      if (error instanceof SpotifyQuotaBlockedError) {
        const cached = await readOwnedPlaylistsCache(spotifyUserId);
        if (cached?.playlists.length) {
          await recordCacheHit("playlists_list");
          return jsonWithSpotifyMeta(
            {
              spotifyUserId,
              playlists: cached.playlists,
              warning:
                "Spotify sync is temporarily unavailable — showing cached library.",
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
    console.error("Spotify playlists list error:", error);
    return spotifyBffErrorResponse(error, "Failed to list playlists");
  }
}
