import { NextRequest, NextResponse } from "next/server";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { buildQuotaSnapshot } from "@/lib/spotify/requestQuota";
import { readSocialRequesterCookie } from "@/lib/spotify/socialRequesterCookie";
import { getOptionalUser } from "@/lib/optionalAuth";

export async function GET(req: NextRequest) {
  try {
    const status = await getActivePlaylistStatus();
    if (
      !status.isActive ||
      !status.spotifyPlaylistId ||
      !status.activatedAt
    ) {
      return NextResponse.json(
        { error: "Song requests aren’t open right now." },
        { status: 403 }
      );
    }

    const user = await getOptionalUser(req);
    const requesterToken = user ? null : readSocialRequesterCookie(req);

    const snapshot = await buildQuotaSnapshot({
      spotifyPlaylistId: status.spotifyPlaylistId,
      activatedAt: status.activatedAt,
      requestLimits: status.requestLimits,
      availableGenres: status.availableGenres,
      requesterUserId: user?.id ?? null,
      requesterToken,
    });

    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    console.error("Social quota error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load quota";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
