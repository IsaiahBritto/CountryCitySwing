import { NextRequest, NextResponse } from "next/server";
import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { getActiveSessionRow } from "@/lib/spotify/djSessionServer";
import {
  enrichRequestsWithEstimates,
  type UserRequestRow,
} from "@/lib/spotify/requestWaitEstimate";
import { getOptionalUser } from "@/lib/optionalAuth";
import { readSocialRequesterCookie } from "@/lib/spotify/socialRequesterCookie";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const user = await getOptionalUser(req);
    const requesterToken = user ? null : readSocialRequesterCookie(req);

    if (!user && !requesterToken) {
      return NextResponse.json(
        { error: "Session required. Refresh the page and try again." },
        { status: 403 }
      );
    }

    const status = await getActivePlaylistStatus();
    if (!status.isActive || !status.spotifyPlaylistId || !status.activatedAt) {
      return NextResponse.json({ requests: [] });
    }

    let query = supabaseServer
      .from("social_song_requests")
      .select(
        "id, spotify_track_id, name, primary_artist, genre, result, position, created_at"
      )
      .eq("spotify_playlist_id", status.spotifyPlaylistId)
      .neq("result", "rejected")
      .gte("created_at", status.activatedAt)
      .order("created_at", { ascending: false });

    if (user) {
      query = query.eq("requester_user_id", user.id);
    } else if (requesterToken) {
      query = query.eq("requester_token", requesterToken);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load requests: ${error.message}`);
    }

    const session = await getActiveSessionRow();
    const requests = enrichRequestsWithEstimates(
      (data ?? []) as UserRequestRow[],
      session
    );

    return NextResponse.json({ requests });
  } catch (error: unknown) {
    console.error("Social my-requests error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
