import { getValidAccessToken } from "@/lib/spotify/auth";
import { fetchPlaylistTracks, type SpotifyTrack } from "@/lib/spotify/client";
import type { CompPoolTrack } from "@/lib/spotify/compCriteria";
import { resolveTrackFeatures } from "@/lib/spotify/features";

export type BuildCompPoolResult = {
  tracks: CompPoolTrack[];
  lookedUp: number;
  stillUnknown: number;
  skippedNoBpm: number;
};

export async function buildCompPool(input: {
  allowedPlaylistIds: string[];
  excludedPlaylistIds: string[];
  lookupFeatures?: boolean;
}): Promise<BuildCompPoolResult> {
  const allowed = [...new Set(input.allowedPlaylistIds.filter(Boolean))];
  if (allowed.length === 0) {
    throw new Error("At least one allowed playlist is required");
  }

  const excludedSet = new Set(input.excludedPlaylistIds.filter(Boolean));
  const { accessToken } = await getValidAccessToken();

  const allTracks: SpotifyTrack[] = [];
  const seen = new Set<string>();

  for (const playlistId of allowed) {
    const tracks = await fetchPlaylistTracks(accessToken, playlistId);
    for (const track of tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      allTracks.push(track);
    }
  }

  const excludedTrackIds = new Set<string>();
  for (const playlistId of excludedSet) {
    const tracks = await fetchPlaylistTracks(accessToken, playlistId);
    for (const track of tracks) {
      excludedTrackIds.add(track.id);
    }
  }

  const poolTracks = allTracks.filter((track) => !excludedTrackIds.has(track.id));
  if (poolTracks.length === 0) {
    throw new Error("No tracks remain in the song pool after exclusions");
  }

  const resolved = await resolveTrackFeatures(poolTracks, {
    lookup: input.lookupFeatures === true,
    retryMode: "bpm_energy",
  });

  const tracks: CompPoolTrack[] = [];
  let skippedNoBpm = 0;
  for (const track of poolTracks) {
    const features = resolved.featuresById.get(track.id);
    if (!features) continue;
    if (!features.trueBpm) {
      skippedNoBpm += 1;
      continue;
    }
    tracks.push({ ...track, features });
  }

  return {
    tracks,
    lookedUp: resolved.lookedUp,
    stillUnknown: resolved.stillUnknown,
    skippedNoBpm,
  };
}
