import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { appleMusicConfigured } from "@/lib/appleMusic/config";
import { getMasterPlaylistRefsForGenres } from "@/lib/spotify/masters";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { musicUserTokenFromRequest } from "@/lib/appleMusic/requestHeaders";
import { getStoredAppleMusicUserToken } from "@/lib/appleMusic/sessionCredentials";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const configured = appleMusicConfigured();
    let musicUserToken = musicUserTokenFromRequest(req);
    if (!musicUserToken) {
      musicUserToken =
        (await getStoredAppleMusicUserToken())?.musicUserToken ?? null;
    }

    let masters: Array<{
      linkId: string;
      label: string;
      spotifyPlaylistId: string;
      genre: string;
    }> = [];
    try {
      const allGenres: GenrePool[] = ["cs", "wcs", "ld", "ts", "wz"];
      masters = (await getMasterPlaylistRefsForGenres(allGenres)).map((m) => ({
        linkId: m.linkId,
        label: m.label,
        spotifyPlaylistId: m.spotifyPlaylistId,
        genre: m.genre,
      }));
    } catch (err) {
      console.error("Failed to load master playlists for Apple status:", err);
    }

    return NextResponse.json({
      configured,
      connected: configured && Boolean(musicUserToken),
      hasMusicUserToken: Boolean(musicUserToken),
      needsAuthorization: configured && !musicUserToken,
      masters,
    });
  } catch (error: unknown) {
    console.error("Apple Music status error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load Apple Music status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
