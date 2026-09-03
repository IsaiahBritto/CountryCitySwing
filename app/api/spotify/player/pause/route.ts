import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      deviceId?: string;
    };

    if (typeof body.deviceId !== "string" || !body.deviceId.trim()) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 }
      );
    }

    const { accessToken } = await getValidAccessToken();
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(body.deviceId.trim())}`,
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
    console.error("Spotify player pause error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to pause playback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
