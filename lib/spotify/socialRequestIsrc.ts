import { normalizeIsrc } from "@/lib/musicae/isrc";
import {
  buildCanonicalTrackByIsrc,
  type PlaylistTrackAtPosition,
} from "@/lib/spotify/masterIsrcIndex";
import { getMasterPlaylistRefsForGenres } from "@/lib/spotify/masters";
import {
  fetchPlaylistTracksWithPositions,
  fetchTrackIsrc,
} from "@/lib/spotify/client";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export type CanonicalSocialRequestFields = {
  trackId: string;
  uri: string;
  name: string;
  primaryArtist: string;
  durationMs?: number;
};

export async function resolveCanonicalSocialRequestFromMaster<
  T extends CanonicalSocialRequestFields,
>(input: {
  request: T;
  masterGenre: GenrePool;
  accessToken: string;
  /** When already fetched (e.g. Country Swing master-genre routing). */
  requestIsrc?: string | null;
  /** Avoid refetching the master playlist when caller already loaded it. */
  masterPlaylistItems?: PlaylistTrackAtPosition[];
}): Promise<T> {
  let isrc = normalizeIsrc(input.requestIsrc);
  if (!isrc) {
    try {
      isrc = normalizeIsrc(
        await fetchTrackIsrc(input.accessToken, input.request.trackId)
      );
    } catch {
      isrc = null;
    }
  }
  if (!isrc) {
    return input.request;
  }

  let items = input.masterPlaylistItems;
  if (!items) {
    const masters = await getMasterPlaylistRefsForGenres([input.masterGenre]);
    const master = masters[0];
    if (!master) {
      return input.request;
    }
    items = await fetchPlaylistTracksWithPositions(
      input.accessToken,
      master.spotifyPlaylistId
    );
  }

  const canonical = buildCanonicalTrackByIsrc(items).get(isrc);
  if (!canonical || canonical.id === input.request.trackId) {
    return input.request;
  }

  return {
    ...input.request,
    trackId: canonical.id,
    uri: canonical.uri,
    name: canonical.name,
    primaryArtist: canonical.primaryArtist,
    durationMs: canonical.durationMs,
  };
}
