import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { listLibraryPlaylists } from "@/lib/appleMusic/client";
import { getCachedAppleDeveloperToken } from "@/lib/appleMusic/developerToken";
import {
  hashMusicUserToken,
  musicUserTokenFromRequest,
} from "@/lib/appleMusic/requestHeaders";
import {
  readAppleOwnedPlaylistsCache,
  writeAppleOwnedPlaylistsCache,
} from "@/lib/appleMusic/serverCache";
import { MusicApiFetchError } from "@/lib/music/apiDiagnostics";

export async function GET(req: NextRequest) {
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

    const userHash = hashMusicUserToken(musicUserToken);
    const force = req.nextUrl.searchParams.get("force") === "1";
    if (!force) {
      const cached = await readAppleOwnedPlaylistsCache(userHash);
      if (cached) {
        return NextResponse.json({
          playlists: cached.playlists,
          stale: false,
          cachedAt: cached.fetchedAt,
        });
      }
    }

    const { token } = getCachedAppleDeveloperToken();
    const playlists = await listLibraryPlaylists({
      developerToken: token,
      musicUserToken,
    });
    await writeAppleOwnedPlaylistsCache({ appleUserHash: userHash, playlists });

    return NextResponse.json({ playlists, stale: false });
  } catch (error: unknown) {
    if (error instanceof MusicApiFetchError && error.isRateLimited) {
      const cached = await readAppleOwnedPlaylistsCache(
        hashMusicUserToken(musicUserTokenFromRequest(req) ?? "")
      );
      if (cached) {
        return NextResponse.json({
          playlists: cached.playlists,
          stale: true,
          cachedAt: cached.fetchedAt,
          error: error.message,
        });
      }
      return NextResponse.json(
        { error: error.message, retryAfterSec: error.retryAfterSec },
        { status: 429 }
      );
    }
    console.error("Apple Music playlists error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playlists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
