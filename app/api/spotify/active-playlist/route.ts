import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  activateSocialPlaylist,
  deactivateSocialPlaylist,
  getActivePlaylistStatus,
} from "@/lib/spotify/activePlaylist";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;
    const status = await getActivePlaylistStatus();
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error("Active playlist GET error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load active playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      playlistIdOrUrl?: string;
    };

    const action = body.action?.trim();
    if (action === "deactivate") {
      const status = await deactivateSocialPlaylist();
      return NextResponse.json(status);
    }

    if (action === "activate" || !action) {
      if (
        typeof body.playlistIdOrUrl !== "string" ||
        !body.playlistIdOrUrl.trim()
      ) {
        return NextResponse.json(
          { error: "playlistIdOrUrl is required to activate" },
          { status: 400 }
        );
      }
      const status = await activateSocialPlaylist({
        playlistIdOrUrl: body.playlistIdOrUrl.trim(),
        activatedBy: auth.userId,
      });
      return NextResponse.json(status);
    }

    return NextResponse.json(
      { error: "action must be activate or deactivate" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("Active playlist POST error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update active playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
