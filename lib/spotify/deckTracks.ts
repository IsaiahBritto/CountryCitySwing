import type { SpotifyTrack } from "@/lib/spotify/client";
import type { DeckTrack } from "@/lib/spotify/djDeckState";
import { supabaseServer } from "@/lib/supabaseServer";

export async function enrichDeckTracks(
  tracks: SpotifyTrack[]
): Promise<DeckTrack[]> {
  if (tracks.length === 0) return [];

  const ids = tracks.map((t) => t.id);
  const bpmById = new Map<string, number>();

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabaseServer
      .from("spotify_track_features")
      .select("spotify_track_id, bpm, true_bpm")
      .in("spotify_track_id", chunk);

    if (error) {
      console.warn("Failed to load track BPM cache:", error.message);
      continue;
    }

    for (const row of data ?? []) {
      if (row.true_bpm && typeof row.bpm === "number" && row.bpm > 0) {
        bpmById.set(row.spotify_track_id, Math.round(row.bpm));
      }
    }
  }

  return tracks.map((track) => ({
    id: track.id,
    uri: track.uri,
    name: track.name,
    primaryArtist: track.primaryArtist,
    durationMs: track.durationMs,
    ...(bpmById.has(track.id) ? { bpm: bpmById.get(track.id) } : {}),
  }));
}
