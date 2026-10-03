import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  assertCompetitionInEvent,
  loadCompPlaylistConfig,
} from "@/lib/spotify/compPlaylistConfigStore";
import {
  configToRow,
  validateCompPlaylistConfig,
} from "@/lib/spotify/compPlaylistValidate";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { competitionId } = await params;
    const eventId = req.nextUrl.searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json(
        { error: "event_id query parameter is required" },
        { status: 400 }
      );
    }

    const belongs = await assertCompetitionInEvent(competitionId, eventId);
    if (!belongs.ok) {
      return NextResponse.json({ error: belongs.error }, { status: 404 });
    }

    const loaded = await loadCompPlaylistConfig(competitionId);
    return NextResponse.json({
      competition: belongs.competition,
      config: loaded.config,
      meta: loaded.meta,
    });
  } catch (error: unknown) {
    console.error("[playlist-config] GET failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playlist config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { competitionId } = await params;
    const body = await req.json().catch(() => ({}));
    const eventId =
      typeof body.event_id === "string" ? body.event_id.trim() : "";
    if (!eventId) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    const belongs = await assertCompetitionInEvent(competitionId, eventId);
    if (!belongs.ok) {
      return NextResponse.json({ error: belongs.error }, { status: 404 });
    }

    const validated = validateCompPlaylistConfig(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const row = configToRow(validated.config);
    const { data, error } = await supabaseServer
      .from("comp_playlist_configs")
      .upsert(
        {
          competition_id: competitionId,
          ...row,
        },
        { onConflict: "competition_id" }
      )
      .select("*")
      .single();

    if (error) {
      console.error("[playlist-config] PATCH failed", error);
      return NextResponse.json(
        { error: "Failed to save playlist config" },
        { status: 500 }
      );
    }

    const loaded = await loadCompPlaylistConfig(competitionId);
    return NextResponse.json({
      competition: belongs.competition,
      config: loaded.config,
      meta: loaded.meta,
      saved: data,
    });
  } catch (error: unknown) {
    console.error("[playlist-config] PATCH failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to save playlist config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
