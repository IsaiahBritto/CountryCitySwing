import { appleMusicApiFetch } from "@/lib/appleMusic/apiFetch";
import { MusicApiFetchError } from "@/lib/music/apiDiagnostics";
import {
  deckTrackFromAppleSongResource,
  normalizeAppleSongResource,
} from "@/lib/appleMusic/normalize";
import { normalizedTrackToDeckTrack } from "@/lib/appleMusic/normalize";
import type { NormalizedTrack } from "@/lib/music/types";
import type { DeckTrack } from "@/lib/spotify/djDeckState";

export type AppleMusicTrack = {
  id: string;
  uri: string;
  name: string;
  durationMs: number;
  primaryArtist: string;
  isrc: string | null;
  /** Library playlist entry id (distinct from catalog song id). */
  libraryRelationshipId?: string | null;
};

export type OwnedPlaylistSummary = {
  id: string;
  name: string;
  trackCount: number | null;
};

type SongsResponse = {
  data?: Array<{
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  }>;
  next?: string;
};

type PlaylistsResponse = {
  data?: Array<{
    id?: string;
    attributes?: { name?: string; trackCount?: number };
  }>;
  next?: string;
};

type SearchResponse = {
  results?: {
    songs?: { data?: SongsResponse["data"] };
  };
};

function toAppleTrack(normalized: NormalizedTrack): AppleMusicTrack {
  const id = normalized.catalogId ?? normalized.libraryId ?? "";
  return {
    id,
    uri: `appleMusic:songs:${id}`,
    name: normalized.title,
    durationMs: normalized.durationMs ?? 0,
    primaryArtist: normalized.artist,
    isrc: normalized.isrc ?? null,
  };
}

/** Apple may return absolute or relative paths in JSON:API `next` links. */
export function resolveAppleMusicNextPath(next: string): string {
  const trimmed = next.trim();
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const nextUrl = new URL(trimmed);
    return `${nextUrl.pathname}${nextUrl.search}`;
  }
  return `/${trimmed.replace(/^\//, "")}`;
}

function mapLibraryPlaylistRows(
  rows: PlaylistsResponse["data"]
): OwnedPlaylistSummary[] {
  return (rows ?? []).map((p) => ({
    id: p.id ?? "",
    name: p.attributes?.name?.trim() || "Untitled",
    trackCount:
      typeof p.attributes?.trackCount === "number"
        ? p.attributes.trackCount
        : null,
  }));
}

export async function listLibraryPlaylists(input: {
  developerToken: string;
  musicUserToken: string;
  limit?: number;
}): Promise<OwnedPlaylistSummary[]> {
  const limit = input.limit ?? 100;
  const out: OwnedPlaylistSummary[] = [];
  let nextPath: string | null = `/v1/me/library/playlists?limit=${limit}`;

  while (nextPath) {
    const page = await appleMusicApiFetch<PlaylistsResponse>(nextPath, {
      developerToken: input.developerToken,
      musicUserToken: input.musicUserToken,
    });
    out.push(...mapLibraryPlaylistRows(page.data));
    nextPath = page.next ? resolveAppleMusicNextPath(page.next) : null;
  }

  return out;
}

export async function fetchLibraryPlaylistTracks(input: {
  developerToken: string;
  musicUserToken: string;
  playlistId: string;
  storefront?: string;
}): Promise<{ tracks: AppleMusicTrack[]; totalDurationMs: number }> {
  const tracks: AppleMusicTrack[] = [];
  let totalDurationMs = 0;
  let nextPath: string | null =
    `/v1/me/library/playlists/${encodeURIComponent(input.playlistId)}/tracks?limit=100`;

  try {
    while (nextPath) {
      const page: SongsResponse = await appleMusicApiFetch<SongsResponse>(
        nextPath,
        {
          developerToken: input.developerToken,
          musicUserToken: input.musicUserToken,
        }
      );
      for (const row of page.data ?? []) {
        const normalized = normalizeAppleSongResource(row, { libraryId: row.id });
        if (!normalized) continue;
        const track = {
          ...toAppleTrack(normalized),
          libraryRelationshipId: row.id ?? null,
        };
        if (track.durationMs <= 0) continue;
        tracks.push(track);
        totalDurationMs += track.durationMs;
      }
      nextPath = page.next ? resolveAppleMusicNextPath(page.next) : null;
    }
  } catch (error) {
    if (
      error instanceof MusicApiFetchError &&
      error.httpStatus === 404 &&
      /no related resources found for tracks/i.test(error.message)
    ) {
      return { tracks: [], totalDurationMs: 0 };
    }
    throw error;
  }

  return { tracks, totalDurationMs };
}

export async function searchCatalogSongs(input: {
  developerToken: string;
  musicUserToken?: string | null;
  storefront: string;
  term: string;
  limit?: number;
}): Promise<AppleMusicTrack[]> {
  const limit = input.limit ?? 25;
  const path = `/v1/catalog/${encodeURIComponent(input.storefront)}/search?term=${encodeURIComponent(input.term)}&types=songs&limit=${limit}`;
  const body = await appleMusicApiFetch<SearchResponse>(path, {
    developerToken: input.developerToken,
    musicUserToken: input.musicUserToken,
  });
  const songs = body.results?.songs?.data ?? [];
  const out: AppleMusicTrack[] = [];
  for (const row of songs) {
    const normalized = normalizeAppleSongResource(row);
    if (!normalized) continue;
    const track = toAppleTrack(normalized);
    if (track.durationMs <= 0) continue;
    out.push(track);
  }
  return out;
}

export function catalogSongsByIsrcRequestPath(
  storefront: string,
  isrcs: string[]
): string {
  const params = new URLSearchParams();
  params.set("filter[isrc]", isrcs.join(","));
  return `/v1/catalog/${encodeURIComponent(storefront)}/songs?${params.toString()}`;
}

export async function fetchCatalogSongsByIsrc(input: {
  developerToken: string;
  storefront: string;
  isrcs: string[];
}): Promise<Map<string, NormalizedTrack>> {
  const map = new Map<string, NormalizedTrack>();
  if (input.isrcs.length === 0) return map;

  const batchSize = 25;
  for (let i = 0; i < input.isrcs.length; i += batchSize) {
    const batch = input.isrcs.slice(i, i + batchSize);
    const path = catalogSongsByIsrcRequestPath(input.storefront, batch);
    const body = await appleMusicApiFetch<SongsResponse>(path, {
      developerToken: input.developerToken,
    });
    for (const row of body.data ?? []) {
      const normalized = normalizeAppleSongResource(row);
      if (!normalized?.isrc) continue;
      if (!map.has(normalized.isrc)) {
        map.set(normalized.isrc, normalized);
      }
    }
  }
  return map;
}

export function appleTracksToDeckTracks(tracks: AppleMusicTrack[]): DeckTrack[] {
  return tracks.map((t) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    primaryArtist: t.primaryArtist,
    durationMs: t.durationMs,
    isrc: t.isrc,
  }));
}

export function deckTracksFromAppleResources(
  rows: SongsResponse["data"]
): DeckTrack[] {
  const tracks: DeckTrack[] = [];
  for (const row of rows ?? []) {
    const deck = deckTrackFromAppleSongResource(row);
    if (deck && deck.durationMs > 0) tracks.push(deck);
  }
  return tracks;
}

export async function createLibraryPlaylist(input: {
  developerToken: string;
  musicUserToken: string;
  name: string;
  description?: string;
}): Promise<{ id: string; name: string }> {
  const body = await appleMusicApiFetch<{ data?: Array<{ id?: string; attributes?: { name?: string } }> }>(
    "/v1/me/library/playlists",
    {
      developerToken: input.developerToken,
      musicUserToken: input.musicUserToken,
      method: "POST",
      body: {
        attributes: {
          name: input.name,
          description: input.description ?? "",
        },
      },
    }
  );
  const row = body.data?.[0];
  if (!row?.id) throw new Error("Failed to create Apple Music playlist");
  return { id: row.id, name: row.attributes?.name ?? input.name };
}

export async function removeTracksFromLibraryPlaylist(input: {
  developerToken: string;
  musicUserToken: string;
  playlistId: string;
  libraryTrackIds: string[];
}): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < input.libraryTrackIds.length; i += chunkSize) {
    const chunk = input.libraryTrackIds.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await appleMusicApiFetch(
      `/v1/me/library/playlists/${encodeURIComponent(input.playlistId)}/tracks`,
      {
        developerToken: input.developerToken,
        musicUserToken: input.musicUserToken,
        method: "DELETE",
        body: {
          data: chunk.map((id) => ({ id, type: "library-songs" })),
        },
      }
    );
  }
}

export async function listLibraryPlaylistTrackRelationshipIds(input: {
  developerToken: string;
  musicUserToken: string;
  playlistId: string;
}): Promise<string[]> {
  const ids: string[] = [];
  let nextPath: string | null =
    `/v1/me/library/playlists/${encodeURIComponent(input.playlistId)}/tracks?limit=100`;

  while (nextPath) {
    const page: SongsResponse = await appleMusicApiFetch<SongsResponse>(nextPath, {
      developerToken: input.developerToken,
      musicUserToken: input.musicUserToken,
    });
    for (const row of page.data ?? []) {
      if (row.id) ids.push(row.id);
    }
    nextPath = page.next ? resolveAppleMusicNextPath(page.next) : null;
  }
  return ids;
}

export async function fetchCatalogSongDurationsMs(input: {
  developerToken: string;
  storefront: string;
  songIds: string[];
}): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const batchSize = 300;
  for (let i = 0; i < input.songIds.length; i += batchSize) {
    const batch = input.songIds.slice(i, i + batchSize);
    const ids = batch.map((id) => encodeURIComponent(id)).join(",");
    const path = `/v1/catalog/${encodeURIComponent(input.storefront)}/songs?ids=${ids}`;
    const body = await appleMusicApiFetch<SongsResponse>(path, {
      developerToken: input.developerToken,
    });
    for (const row of body.data ?? []) {
      const normalized = normalizeAppleSongResource(row);
      if (!normalized?.catalogId) continue;
      if (typeof normalized.durationMs === "number" && normalized.durationMs > 0) {
        map.set(normalized.catalogId, normalized.durationMs);
      }
    }
  }
  return map;
}

export async function addTracksToLibraryPlaylist(input: {
  developerToken: string;
  musicUserToken: string;
  playlistId: string;
  songIds: string[];
}): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < input.songIds.length; i += chunkSize) {
    const chunk = input.songIds.slice(i, i + chunkSize);
    await appleMusicApiFetch(
      `/v1/me/library/playlists/${encodeURIComponent(input.playlistId)}/tracks`,
      {
        developerToken: input.developerToken,
        musicUserToken: input.musicUserToken,
        method: "POST",
        body: {
          data: chunk.map((id) => ({ id, type: "songs" })),
        },
      }
    );
  }
}

export function normalizedToDeckTrack(track: NormalizedTrack): DeckTrack {
  return normalizedTrackToDeckTrack(track);
}
