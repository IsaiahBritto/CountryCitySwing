import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getStoredSpotifyCredentials } from "@/lib/spotify/auth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const auth = await requireAdminAuth(_req);
    if (!auth.ok) return auth.response;

    const { eventId } = await params;

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id, title, starts_at, ends_at, time_zone, type")
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

    return NextResponse.json({
      event,
      competitions: competitions ?? [],
      spotifyConnected: Boolean(creds),
    });
  } catch (error: unknown) {
    console.error("[playlist-setup] GET failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to load playlist setup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
