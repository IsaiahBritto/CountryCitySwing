import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { syncPlaylistFeatures } from "@/lib/spotify/syncFeatures";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      playlistId?: string;
      playlistIds?: string[];
    };

    const result = await syncPlaylistFeatures({
      playlistId: body.playlistId,
      playlistIds: body.playlistIds,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Spotify sync-features error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to sync features";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
