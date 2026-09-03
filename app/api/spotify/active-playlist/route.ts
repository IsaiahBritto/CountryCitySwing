import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  activateSocialPlaylist,
  deactivateSocialPlaylist,
  getActivePlaylistStatus,
  updateSocialRequestLimits,
} from "@/lib/spotify/activePlaylist";
import { parseRequestLimits } from "@/lib/spotify/requestLimits";
import {
  parsePlaylistStructure,
  DEFAULT_SOCIAL_STRUCTURE,
} from "@/lib/spotify/playlistStructure";

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
      requestLimits?: unknown;
      structure?: unknown;
    };

    const action = body.action?.trim();
    if (action === "deactivate") {
      const status = await deactivateSocialPlaylist();
      return NextResponse.json(status);
    }

    if (action === "updateLimits") {
      const parsed = parseRequestLimits(body.requestLimits);
      if (!parsed) {
        return NextResponse.json(
          { error: "requestLimits must be an object with genre keys" },
          { status: 400 }
        );
      }
      const status = await updateSocialRequestLimits(parsed);
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
      const requestLimits =
        body.requestLimits != null
          ? parseRequestLimits(body.requestLimits)
          : undefined;
      if (body.requestLimits != null && !requestLimits) {
        return NextResponse.json(
          { error: "requestLimits must be an object with genre keys" },
          { status: 400 }
        );
      }
      const structure =
        body.structure != null
          ? parsePlaylistStructure(body.structure) ?? DEFAULT_SOCIAL_STRUCTURE
          : DEFAULT_SOCIAL_STRUCTURE;
      const status = await activateSocialPlaylist({
        playlistIdOrUrl: body.playlistIdOrUrl.trim(),
        activatedBy: auth.userId,
        requestLimits: requestLimits ?? undefined,
        structure,
      });
      return NextResponse.json(status);
    }

    return NextResponse.json(
      { error: "action must be activate, deactivate, or updateLimits" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("Active playlist POST error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update active playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
