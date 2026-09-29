import { supabaseServer } from "@/lib/supabaseServer";
import {
  defaultCompPlaylistConfig,
  rowToConfig,
  type CompPlaylistConfigRow,
} from "@/lib/spotify/compPlaylistTypes";

export async function loadCompPlaylistConfig(competitionId: string) {
  const { data, error } = await supabaseServer
    .from("comp_playlist_configs")
    .select("*")
    .eq("competition_id", competitionId)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load playlist config");
  }

  if (!data) {
    return {
      config: defaultCompPlaylistConfig(),
      meta: {
        lastSpotifyPlaylistId: null,
        lastSpotifyPlaylistUrl: null,
        lastGeneratedAt: null,
        updatedAt: null,
      },
    };
  }

  const row = data as CompPlaylistConfigRow;
  return {
    config: rowToConfig(row),
    meta: {
      lastSpotifyPlaylistId: row.last_spotify_playlist_id,
      lastSpotifyPlaylistUrl: row.last_spotify_playlist_url,
      lastGeneratedAt: row.last_generated_at,
      updatedAt: row.updated_at,
    },
  };
}

export async function assertCompetitionInEvent(
  competitionId: string,
  eventId: string
) {
  const { data, error } = await supabaseServer
    .from("competitions")
    .select("id, name, event_id")
    .eq("id", competitionId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false as const, error: "Competition not found" };
  }
  if (data.event_id !== eventId) {
    return { ok: false as const, error: "Competition does not belong to this event" };
  }
  return { ok: true as const, competition: data };
}
