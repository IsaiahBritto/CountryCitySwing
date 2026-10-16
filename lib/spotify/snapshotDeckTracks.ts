import { fetchCatalogSongDurationsMs } from "@/lib/appleMusic/client";
import { getMusicServiceAccess } from "@/lib/music/serviceAccess";
import { isServerAppleMusic } from "@/lib/music/serverProvider";
import {
  loadSnapshotTracks,
  snapshotRowTrackId,
} from "@/lib/spotify/activePlaylist";
import { enrichDeckTracks } from "@/lib/spotify/deckTracks";
import type { DeckTrack } from "@/lib/spotify/djDeckState";

export async function loadDeckTracksFromSocialSnapshot(): Promise<{
  tracks: DeckTrack[];
  totalDurationMs: number;
}> {
  const rows = await loadSnapshotTracks();
  let durationById = new Map<string, number>();

  if (await isServerAppleMusic()) {
    try {
      const access = await getMusicServiceAccess();
      if (access.provider === "apple_music") {
        const ids = rows.map((r) => snapshotRowTrackId(r));
        durationById = await fetchCatalogSongDurationsMs({
          developerToken: access.developerToken,
          storefront: access.storefrontId,
          songIds: ids,
        });
      }
    } catch (err) {
      console.warn("Could not load Apple catalog durations for deck snapshot:", err);
    }
  }

  const tracks: DeckTrack[] = rows.map((r) => {
    const id = snapshotRowTrackId(r);
    return {
      id,
      uri: r.uri,
      name: r.name,
      primaryArtist: r.primary_artist,
      durationMs: durationById.get(id) ?? 0,
      isrc: null,
    };
  });

  const enriched = await enrichDeckTracks(
    tracks.map((t) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      durationMs: t.durationMs,
      primaryArtist: t.primaryArtist,
      isrc: t.isrc ?? null,
    }))
  );

  const totalDurationMs = enriched.reduce((sum, t) => sum + t.durationMs, 0);
  return { tracks: enriched, totalDurationMs };
}
