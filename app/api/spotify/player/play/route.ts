import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";

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
    };

    if (typeof body.uri !== "string" || !body.uri.trim()) {
      return NextResponse.json({ error: "uri is required" }, { status: 400 });
    }
    if (typeof body.deviceId !== "string" || !body.deviceId.trim()) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 }
      );
    }

    const { accessToken } = await getValidAccessToken();
    const res = await spotifyPlayerFetch(
      accessToken,
      `/me/player/play?device_id=${encodeURIComponent(body.deviceId.trim())}`,
      {
        method: "PUT",
        body: JSON.stringify({ uris: [body.uri.trim()] }),
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
