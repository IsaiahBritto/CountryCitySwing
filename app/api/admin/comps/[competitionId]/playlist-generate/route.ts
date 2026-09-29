import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  assertCompetitionInEvent,
  loadCompPlaylistConfig,
} from "@/lib/spotify/compPlaylistConfigStore";
import { validateCompPlaylistConfig } from "@/lib/spotify/compPlaylistValidate";
import { generateCompPlaylist } from "@/lib/spotify/generateComp";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { competitionId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      event_id?: string;
      lookupFeatures?: boolean;
      config?: unknown;
    };

    const eventId =
      typeof body.event_id === "string" ? body.event_id.trim() : "";
    if (!eventId) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    const belongs = await assertCompetitionInEvent(competitionId, eventId);
    if (!belongs.ok) {
      return NextResponse.json({ error: belongs.error }, { status: 404 });
    }

    let config;
    if (body.config !== undefined) {
      const validated = validateCompPlaylistConfig(body.config);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      config = validated.config;
    } else {
      const loaded = await loadCompPlaylistConfig(competitionId);
      config = loaded.config;
      const validated = validateCompPlaylistConfig(config);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      config = validated.config;
    }

    const result = await generateCompPlaylist({
      competitionId,
      config,
      lookupFeatures: body.lookupFeatures === true,
    });

    const loaded = await loadCompPlaylistConfig(competitionId);

    return NextResponse.json({
      ...result,
      meta: loaded.meta,
    });
  } catch (error: unknown) {
    console.error("[playlist-generate] POST failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate playlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
