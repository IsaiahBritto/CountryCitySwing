import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getStoredSpotifyCredentials, getValidAccessToken } from "@/lib/spotify/auth";
import { needsDeckReconnect } from "@/lib/spotify/scopes";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const creds = await getStoredSpotifyCredentials();
    if (!creds) {
      return NextResponse.json(
        { error: "Spotify is not connected" },
        { status: 503 }
      );
    }

    if (needsDeckReconnect(creds.grantedScopes)) {
      return NextResponse.json(
        {
          error: "Spotify reconnect required for DJ deck playback scopes",
          needsDeckReconnect: true,
        },
        { status: 403 }
      );
    }

    const { accessToken, spotifyUserId, expiresIn } = await getValidAccessToken();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return NextResponse.json({
      accessToken,
      expiresAt,
      spotifyUserId,
    });
  } catch (error: unknown) {
    console.error("Spotify player-token error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load player token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
