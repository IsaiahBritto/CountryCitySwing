import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { resolveHostDeviceId } from "@/lib/spotify/djSessionServer";
import { parseSpotifyApiError } from "@/lib/spotify/spotifyApiErrors";
import { jsonSpotifyPlayerError } from "@/lib/spotify/spotifyPlayerRouteErrors";
import { logSpotifyWebApiError } from "@/lib/spotify/spotifyWebApiDiagnostics";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      deviceId?: string;
      sessionId?: string;
    };

    const resolved = await resolveHostDeviceId(body.sessionId, body.deviceId);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status }
      );
    }

    const { accessToken } = await getValidAccessToken();
    const path = `/me/player/pause?device_id=${encodeURIComponent(resolved.deviceId)}`;
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      logSpotifyWebApiError({
        method: "PUT",
        path,
        status: res.status,
        responseText: text,
        headers: res.headers,
      });
      return jsonSpotifyPlayerError(text || res.statusText, res.status);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Spotify player pause error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to pause playback";
    return NextResponse.json(
      { error: parseSpotifyApiError(message, 500) },
      { status: 500 }
    );
  }
}
