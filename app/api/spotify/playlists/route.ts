import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { listOwnedPlaylists } from "@/lib/spotify/client";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { accessToken, spotifyUserId } = await getValidAccessToken();
    const playlists = await listOwnedPlaylists(accessToken, spotifyUserId, {
      limit: 100,
    });

    return NextResponse.json({
      spotifyUserId,
      playlists,
    });
  } catch (error: unknown) {
    console.error("Spotify playlists list error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list playlists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
