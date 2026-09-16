import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  activateSocialPlaylist,
  deactivateSocialPlaylist,
  getActivePlaylistStatus,
  updateSocialRequestLimits,
} from "@/lib/spotify/activePlaylist";
import { parseRequestLimits } from "@/lib/spotify/requestLimits";
import { parseRequestRefreshMinutes } from "@/lib/spotify/requestRefresh";
import {
  parsePlaylistStructure,
  validatePlaylistStructure,
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
      requestRefreshMinutes?: unknown;
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
      const requestRefreshMinutes =
        body.requestRefreshMinutes != null
          ? parseRequestRefreshMinutes(body.requestRefreshMinutes)
          : undefined;
      if (
        body.requestRefreshMinutes != null &&
        requestRefreshMinutes == null
      ) {
        return NextResponse.json(
          { error: "requestRefreshMinutes must be 15, 30, 45, or 60" },
          { status: 400 }
        );
      }
      const status = await updateSocialRequestLimits({
        requestLimits: parsed,
        requestRefreshMinutes: requestRefreshMinutes ?? undefined,
      });
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
      const parsedStructure = parsePlaylistStructure(body.structure);
      if (!parsedStructure) {
        return NextResponse.json(
          { error: "structure is required and must be a valid playlist structure" },
          { status: 400 }
        );
      }
      let structure;
      try {
        structure = validatePlaylistStructure(parsedStructure);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Invalid playlist structure";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      const requestRefreshMinutes =
        body.requestRefreshMinutes != null
          ? parseRequestRefreshMinutes(body.requestRefreshMinutes)
          : undefined;
      if (
        body.requestRefreshMinutes != null &&
        requestRefreshMinutes == null
      ) {
        return NextResponse.json(
          { error: "requestRefreshMinutes must be 15, 30, 45, or 60" },
          { status: 400 }
        );
      }
      const status = await activateSocialPlaylist({
        playlistIdOrUrl: body.playlistIdOrUrl.trim(),
        activatedBy: auth.userId,
        requestLimits: requestLimits ?? undefined,
        requestRefreshMinutes: requestRefreshMinutes ?? undefined,
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
