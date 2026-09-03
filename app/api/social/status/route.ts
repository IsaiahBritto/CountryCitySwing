import { NextResponse } from "next/server";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";

export async function GET() {
  try {
    const status = await getActivePlaylistStatus();
    return NextResponse.json({
      isActive: status.isActive,
      name: status.isActive ? status.name : null,
      playlistUrl: status.isActive ? status.playlistUrl : null,
      trackCount: status.isActive ? status.trackCount : 0,
      activatedAt: status.isActive ? status.activatedAt : null,
      availableGenres: status.isActive ? status.availableGenres : [],
    });
  } catch (error: unknown) {
    console.error("Social status error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load social status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
