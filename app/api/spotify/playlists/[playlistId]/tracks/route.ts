import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { fetchPlaylistTracks } from "@/lib/spotify/client";
import { enrichDeckTracks } from "@/lib/spotify/deckTracks";
import { parseSpotifyPlaylistId } from "@/lib/spotify/playlistIds";

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

    const { accessToken } = await getValidAccessToken();
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

    return NextResponse.json({
      playlistId,
      tracks: enriched,
      totalDurationMs,
    });
  } catch (error: unknown) {
    console.error("Spotify playlist tracks error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playlist tracks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
