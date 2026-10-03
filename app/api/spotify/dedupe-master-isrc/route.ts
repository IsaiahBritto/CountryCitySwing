import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { dedupeMasterPlaylistsIsrc } from "@/lib/spotify/masterIsrcDedupe";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      playlistId?: string;
      playlistIds?: string[];
    };

    const playlistIds = [
      ...(body.playlistId ? [body.playlistId] : []),
      ...(body.playlistIds ?? []),
    ];

    const { accessToken } = await getValidAccessToken();
    const result = await dedupeMasterPlaylistsIsrc({
      accessToken,
      playlistIds: playlistIds.length > 0 ? playlistIds : undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Spotify dedupe-master-isrc error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to dedupe master playlists by ISRC";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
