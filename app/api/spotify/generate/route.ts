import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { generatePlaylist } from "@/lib/spotify/generate";
import {
  parsePlaylistStructure,
  validateDurationMinutes,
  validatePlaylistStructure,
  DEFAULT_SOCIAL_STRUCTURE,
  DEFAULT_DURATION_MINUTES,
} from "@/lib/spotify/playlistStructure";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      lookupFeatures?: boolean;
      durationMinutes?: number;
      structure?: unknown;
    };
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const durationMinutes = validateDurationMinutes(
      typeof body.durationMinutes === "number"
        ? body.durationMinutes
        : DEFAULT_DURATION_MINUTES
    );
    const structure = validatePlaylistStructure(
      body.structure != null
        ? parsePlaylistStructure(body.structure) ?? DEFAULT_SOCIAL_STRUCTURE
        : DEFAULT_SOCIAL_STRUCTURE
    );

    const result = await generatePlaylist(body.name, {
      lookupFeatures: body.lookupFeatures === true,
      durationMinutes,
      structure,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Spotify generate error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
