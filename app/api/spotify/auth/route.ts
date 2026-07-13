import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { beginSpotifyOAuth } from "@/lib/spotify/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { url } = await beginSpotifyOAuth();
    return NextResponse.json({ url });
  } catch (error: unknown) {
    console.error("Spotify auth error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to start Spotify auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
