import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { loadDeckTracksFromSocialSnapshot } from "@/lib/spotify/snapshotDeckTracks";
import { spotifyStaleMeta, jsonWithSpotifyMeta } from "@/lib/spotify/spotifyBffResponse";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const status = await getActivePlaylistStatus();
    if (!status.isActive || !status.spotifyPlaylistId) {
      return NextResponse.json(
        { error: "No active social playlist" },
        { status: 404 }
      );
    }

    const { tracks, totalDurationMs } = await loadDeckTracksFromSocialSnapshot();
    const meta = await spotifyStaleMeta();

    return jsonWithSpotifyMeta(
      {
        playlistId: status.spotifyPlaylistId,
        tracks,
        totalDurationMs,
        source: "supabase_snapshot" as const,
      },
      meta
    );
  } catch (error: unknown) {
    console.error("Active playlist deck-tracks error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load snapshot tracks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
