import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { loadDeckTracksFromSocialSnapshot } from "@/lib/spotify/snapshotDeckTracks";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const status = await getActivePlaylistStatus();
    const playlistId =
      status.appleMusicPlaylistId ?? status.spotifyPlaylistId ?? null;
    if (!status.isActive || !playlistId) {
      return NextResponse.json(
        { error: "No active social playlist" },
        { status: 404 }
      );
    }

    const { tracks, totalDurationMs } = await loadDeckTracksFromSocialSnapshot();
    return NextResponse.json({
      playlistId,
      tracks,
      totalDurationMs,
      source: "supabase_snapshot" as const,
    });
  } catch (error: unknown) {
    console.error("Active playlist deck-tracks (Apple) error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load snapshot tracks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
