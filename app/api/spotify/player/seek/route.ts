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
      positionMs?: number;
    };

    if (typeof body.positionMs !== "number" || body.positionMs < 0) {
      return NextResponse.json(
        { error: "positionMs must be a non-negative number" },
        { status: 400 }
      );
    }

    const resolved = await resolveHostDeviceId(body.sessionId, body.deviceId);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status }
      );
    }

    const { accessToken } = await getValidAccessToken();
    const path = `/me/player/seek?position_ms=${Math.floor(body.positionMs)}&device_id=${encodeURIComponent(resolved.deviceId)}`;
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
    console.error("Spotify player seek error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to seek playback";
    return NextResponse.json(
      { error: parseSpotifyApiError(message, 500) },
      { status: 500 }
    );
  }
}
