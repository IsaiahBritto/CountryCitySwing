import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { resolveHostDeviceId } from "@/lib/spotify/djSessionServer";

async function spotifyPlayerFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      uri?: string;
      deviceId?: string;
      sessionId?: string;
      positionMs?: number;
    };

    if (typeof body.uri !== "string" || !body.uri.trim()) {
      return NextResponse.json({ error: "uri is required" }, { status: 400 });
    }

    const resolved = await resolveHostDeviceId(body.sessionId, body.deviceId);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status }
      );
    }

    const { accessToken } = await getValidAccessToken();
    const playBody: { uris: string[]; position_ms?: number } = {
      uris: [body.uri.trim()],
    };
    if (typeof body.positionMs === "number" && body.positionMs > 0) {
      playBody.position_ms = Math.floor(body.positionMs);
    }

    const res = await spotifyPlayerFetch(
      accessToken,
      `/me/player/play?device_id=${encodeURIComponent(resolved.deviceId)}`,
      {
        method: "PUT",
        body: JSON.stringify(playBody),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: text || res.statusText },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Spotify player play error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to start playback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
