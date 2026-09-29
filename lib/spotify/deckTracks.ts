import type { SpotifyTrack } from "@/lib/spotify/client";
import type { DeckTrack } from "@/lib/spotify/djDeckState";
import {
  analysisRowToDeckFields,
} from "@/lib/audioAnalysis/map";
import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { normalizeIsrc } from "@/lib/musicae/isrc";

export async function enrichDeckTracks(
  tracks: SpotifyTrack[]
): Promise<DeckTrack[]> {
  if (tracks.length === 0) return [];

  const analysisByTrackId = await loadCachedAnalysisForTracks(
    tracks.map((t) => ({ id: t.id, isrc: t.isrc }))
  );

  return tracks.map((track) => {
    const row = analysisByTrackId.get(track.id) ?? null;
    const deckFields = analysisRowToDeckFields(row);

    const deckTrack: DeckTrack = {
      id: track.id,
      uri: track.uri,
      name: track.name,
      primaryArtist: track.primaryArtist,
      durationMs: track.durationMs,
      isrc: normalizeIsrc(track.isrc),
      ...deckFields,
    };

    return deckTrack;
  });
}
