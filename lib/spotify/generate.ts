import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  createPrivatePlaylist,
  fetchPlaylistTracks,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import { curatePlaylist, type CurateTrack } from "@/lib/spotify/curate";
import { resolveTrackFeatures } from "@/lib/spotify/features";
import { getMasterPlaylistRefsForStructure } from "@/lib/spotify/masters";
import { emptyGenrePools, type GenrePool } from "@/lib/spotify/playlistIds";
import {
  DEFAULT_SOCIAL_STRUCTURE,
  DEFAULT_DURATION_MINUTES,
  expandStructure,
  structureDescription,
  validateDurationMinutes,
  validatePlaylistStructure,
  type PlaylistStructure,
} from "@/lib/spotify/playlistStructure";

export type GeneratePlaylistResult = {
  id: string;
  url: string;
  durationMs: number;
  trackCount: number;
  lookedUp: number;
  stillUnknown: number;
  durationMinutes: number;
  structure: PlaylistStructure;
};

export type GeneratePlaylistOptions = {
  lookupFeatures?: boolean;
  durationMinutes?: number;
  structure?: PlaylistStructure;
};

export async function generatePlaylist(
  name: string,
  options?: GeneratePlaylistOptions
): Promise<GeneratePlaylistResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Playlist name is required");
  }
  if (trimmed.length > 100) {
    throw new Error("Playlist name must be 100 characters or fewer");
  }

  const lookupFeatures = options?.lookupFeatures === true;
  const durationMinutes = validateDurationMinutes(
    options?.durationMinutes ?? DEFAULT_DURATION_MINUTES
  );
  const structure = validatePlaylistStructure(
    options?.structure ?? DEFAULT_SOCIAL_STRUCTURE
  );
  const pattern = expandStructure(structure);
  const targetDurationMs = durationMinutes * 60 * 1000;

  const { accessToken } = await getValidAccessToken();
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

  const description = `Country City Swing — ${structureDescription(structure)} / ${durationMinutes} min`;

  const created = await createPrivatePlaylist(
    accessToken,
    trimmed,
    description
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
    durationMinutes,
    structure,
  };
}

/** @deprecated use generatePlaylist */
export async function generateSocialPlaylist(
  name: string,
  options?: { lookupFeatures?: boolean }
): Promise<Omit<GeneratePlaylistResult, "durationMinutes" | "structure">> {
  const result = await generatePlaylist(name, options);
  const { durationMinutes: _d, structure: _s, ...rest } = result;
  return rest;
}
