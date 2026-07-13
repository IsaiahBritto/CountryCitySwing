import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getStoredSpotifyCredentials } from "@/lib/spotify/auth";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const creds = await getStoredSpotifyCredentials();
    let masters: Array<{
      linkId: string;
      label: string;
      spotifyPlaylistId: string;
      genre: string;
    }> = [];

    try {
      masters = (await getMasterPlaylistRefs()).map((m) => ({
        linkId: m.linkId,
        label: m.label,
        spotifyPlaylistId: m.spotifyPlaylistId,
        genre: m.genre,
      }));
    } catch (err) {
      console.error("Failed to load master playlists for status:", err);
    }

    return NextResponse.json({
      connected: Boolean(creds),
      spotifyUserId: creds?.spotifyUserId ?? null,
      masters,
    });
  } catch (error: unknown) {
    console.error("Spotify status error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load Spotify status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
