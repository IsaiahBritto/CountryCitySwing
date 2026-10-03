import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  fetchPlaylistMeta,
  fetchPlaylistSnapshotIdOnly,
} from "@/lib/spotify/client";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import {
  readActivePlaylistSnapshotId,
  writeActivePlaylistSnapshotId,
} from "@/lib/spotify/spotifyServerCache";
import { spotifyBffErrorResponse } from "@/lib/spotify/spotifyBffResponse";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const status = await getActivePlaylistStatus();
    if (!status.isActive || !status.spotifyPlaylistId) {
      return NextResponse.json(
        { error: "No active social playlist" },
        { status: 404 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      fullRefresh?: boolean;
    };

    const { accessToken } = await getValidAccessToken();
    const playlistId = status.spotifyPlaylistId;
    const cached = await readActivePlaylistSnapshotId();
    const meta = await fetchPlaylistMeta(accessToken, playlistId);
    const remoteSnapshot = meta.snapshotId;

    const inSync = Boolean(
      cached && remoteSnapshot && cached === remoteSnapshot
    );

    if (body.fullRefresh) {
      const snapshotId = await fetchPlaylistSnapshotIdOnly(
        accessToken,
        playlistId
      );
      await writeActivePlaylistSnapshotId(snapshotId);
      return NextResponse.json({
        ok: true,
        inSync: true,
        snapshotId,
        fullRefresh: true,
      });
    }

    if (remoteSnapshot) {
      await writeActivePlaylistSnapshotId(remoteSnapshot);
    }

    return NextResponse.json({
      ok: true,
      inSync,
      cachedSnapshotId: cached,
      remoteSnapshotId: remoteSnapshot,
    });
  } catch (error: unknown) {
    console.error("Spotify reconcile error:", error);
    return spotifyBffErrorResponse(error, "Reconcile failed");
  }
}
