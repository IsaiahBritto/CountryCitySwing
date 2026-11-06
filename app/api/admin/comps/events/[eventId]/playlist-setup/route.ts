import { NextRequest, NextResponse } from "next/server";
import { authCompEventManage } from "@/lib/compApiAuth";
import {
  COMMUNITY_COMP_PLAYLIST_FORBIDDEN_MESSAGE,
  isCommunityCompEventId,
} from "@/lib/compEventAccess";
import { getStoredSpotifyCredentials } from "@/lib/spotify/auth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const auth = await authCompEventManage(_req, eventId);
    if (!auth.ok) return auth.response;

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id, title, starts_at, ends_at, time_zone, type, host_kind")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { data: competitions, error: compError } = await supabaseServer
      .from("competitions")
      .select("id, name, comp_type, status")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (compError) {
      return NextResponse.json(
        { error: "Failed to load competitions" },
        { status: 500 }
      );
    }

    const creds = await getStoredSpotifyCredentials();
    const playlistGenerationDisabled = await isCommunityCompEventId(eventId);

    return NextResponse.json({
      event,
      competitions: competitions ?? [],
      spotifyConnected: Boolean(creds),
      playlistGenerationDisabled,
      playlistGenerationDisabledReason: playlistGenerationDisabled
        ? COMMUNITY_COMP_PLAYLIST_FORBIDDEN_MESSAGE
        : null,
    });
  } catch (error: unknown) {
    console.error("[playlist-setup] GET failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playlist setup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
