import { loadSnapshotTracks } from "@/lib/spotify/activePlaylist";
import { enrichDeckTracks } from "@/lib/spotify/deckTracks";
import type { DeckTrack } from "@/lib/spotify/djDeckState";

export async function loadDeckTracksFromSocialSnapshot(): Promise<{
  tracks: DeckTrack[];
  totalDurationMs: number;
}> {
  const rows = await loadSnapshotTracks();
  const tracks: DeckTrack[] = rows.map((r) => ({
    id: r.spotify_track_id,
    uri: r.uri,
    name: r.name,
    primaryArtist: r.primary_artist,
    durationMs: 0,
  }));

  const enriched = await enrichDeckTracks(
    tracks.map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      durationMs: t.durationMs,
      primaryArtist: t.primaryArtist,
      isrc: null,
    }))
  );

  const totalDurationMs = enriched.reduce((sum, t) => sum + t.durationMs, 0);
  return { tracks: enriched, totalDurationMs };
}
