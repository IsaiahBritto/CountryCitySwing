import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  createPrivatePlaylist,
  fetchPlaylistTracks,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import {
  curateSocialPlaylist,
  type CurateTrack,
} from "@/lib/spotify/curate";
import { resolveTrackFeatures } from "@/lib/spotify/features";
import { getMasterPlaylistRefs } from "@/lib/spotify/masters";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export type GenerateSocialResult = {
  id: string;
  url: string;
  durationMs: number;
  trackCount: number;
  lookedUp: number;
  stillUnknown: number;
};

export async function generateSocialPlaylist(
  name: string
): Promise<GenerateSocialResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Playlist name is required");
  }
  if (trimmed.length > 100) {
    throw new Error("Playlist name must be 100 characters or fewer");
  }

  const { accessToken } = await getValidAccessToken();
  const masters = await getMasterPlaylistRefs();

  const pools: Record<GenrePool, CurateTrack[]> = {
    cs: [],
    wcs: [],
    ld: [],
  };

  const allTracks: SpotifyTrack[] = [];
  const trackGenre = new Map<string, GenrePool>();

  for (const master of masters) {
    const tracks = await fetchPlaylistTracks(
      accessToken,
      master.spotifyPlaylistId
    );
    for (const track of tracks) {
      allTracks.push(track);
      // Prefer first genre if a track appears in multiple masters
      if (!trackGenre.has(track.id)) {
        trackGenre.set(track.id, master.genre);
      }
    }
  }

  const resolved = await resolveTrackFeatures(allTracks);

  const addedToPool = new Set<string>();
  for (const track of allTracks) {
    if (addedToPool.has(track.id)) continue;
    const genre = trackGenre.get(track.id);
    const features = resolved.featuresById.get(track.id);
    if (!genre || !features) continue;
    pools[genre].push({ ...track, genre, features });
    addedToPool.add(track.id);
  }

  const curated = curateSocialPlaylist(pools);

  const created = await createPrivatePlaylist(
    accessToken,
    trimmed,
    "Country City Swing Social — auto-generated mix (2 CS / 2 WCS / 2 LD)"
  );

  await addTracksToPlaylist(
    accessToken,
    created.id,
    curated.tracks.map((t) => t.uri)
  );

  return {
    id: created.id,
    url: created.url,
    durationMs: curated.durationMs,
    trackCount: curated.tracks.length,
    lookedUp: resolved.lookedUp,
    stillUnknown: resolved.stillUnknown,
  };
}
