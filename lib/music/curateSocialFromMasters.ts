import { fetchPlaylistTracks, type SpotifyTrack } from "@/lib/spotify/client";
import {
  curatePlaylist,
  type CurateTrack,
  type CurateResult,
} from "@/lib/spotify/curate";
import { resolveTrackFeatures } from "@/lib/spotify/features";
import { getMasterPlaylistRefsForStructure } from "@/lib/spotify/masters";
import { emptyGenrePools, type GenrePool } from "@/lib/spotify/playlistIds";
import {
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SOCIAL_STRUCTURE,
  expandStructure,
  validateDurationMinutes,
  validatePlaylistStructure,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";

export type CurateSocialFromMastersOptions = {
  lookupFeatures?: boolean;
  durationMinutes?: number;
  structure?: PlaylistStructure;
  spotifyAccessToken: string;
};

export type CurateSocialFromMastersResult = {
  curated: CurateResult;
  pools: Record<GenrePool, CurateTrack[]>;
  lookedUp: number;
  stillUnknown: number;
  durationMinutes: number;
  structure: PlaylistStructure;
  pattern: GenrePool[];
};

export async function curateSocialFromMasters(
  options: CurateSocialFromMastersOptions
): Promise<CurateSocialFromMastersResult> {
  const lookupFeatures = options.lookupFeatures === true;
  const durationMinutes = validateDurationMinutes(
    options.durationMinutes ?? DEFAULT_DURATION_MINUTES
  );
  const structure = validatePlaylistStructure(
    options.structure ?? DEFAULT_SOCIAL_STRUCTURE
  );
  const pattern = expandStructure(structure);
  const targetDurationMs = durationMinutes * 60 * 1000;
  const accessToken = options.spotifyAccessToken;

  const masters = await getMasterPlaylistRefsForStructure(structure);
  const pools = emptyGenrePools<CurateTrack[]>();
  const allTracks: SpotifyTrack[] = [];
  const trackGenre = new Map<string, GenrePool>();

  for (const master of masters) {
    const tracks = await fetchPlaylistTracks(
      accessToken,
      master.spotifyPlaylistId
    );
    for (const track of tracks) {
      allTracks.push(track);
      if (!trackGenre.has(track.id)) {
        trackGenre.set(track.id, master.genre);
      }
    }
  }

  const resolved = await resolveTrackFeatures(allTracks, {
    lookup: lookupFeatures,
    retryMode: "bpm_energy",
  });

  const addedToPool = new Set<string>();
  for (const track of allTracks) {
    if (addedToPool.has(track.id)) continue;
    const genre = trackGenre.get(track.id);
    const features = resolved.featuresById.get(track.id);
    if (!genre || !features) continue;
    pools[genre].push({ ...track, genre, features });
    addedToPool.add(track.id);
  }

  const curated = curatePlaylist(pools, {
    pattern,
    targetDurationMs,
  });

  return {
    curated,
    pools,
    lookedUp: resolved.lookedUp,
    stillUnknown: resolved.stillUnknown,
    durationMinutes,
    structure,
    pattern,
  };
}
