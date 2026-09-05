import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { resolveHostDeviceId } from "@/lib/spotify/djSessionServer";

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
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.floor(body.positionMs)}&device_id=${encodeURIComponent(resolved.deviceId)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: text || res.statusText },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Spotify player seek error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to seek playback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
