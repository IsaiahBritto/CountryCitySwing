export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  durationMs: number;
  primaryArtist: string;
  isrc: string | null;
};

export type SpotifySearchTrack = {
  id: string;
  uri: string;
  name: string;
  primaryArtist: string;
  albumName: string | null;
  imageUrl: string | null;
  durationMs: number;
};

type SpotifyApiErrorBody = { error?: { message?: string; status?: number } };

async function spotifyFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || res.statusText;
    try {
      const body = JSON.parse(text) as SpotifyApiErrorBody;
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep text
    }
    throw new Error(`Spotify API ${path} failed (${res.status}): ${message}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function mapArtists(artists: unknown): string {
  if (!Array.isArray(artists)) return "Unknown";
  return (
    artists
      .map((a) =>
        a && typeof a === "object" && typeof (a as { name?: unknown }).name === "string"
          ? (a as { name: string }).name
          : null
      )
      .find(Boolean) ?? "Unknown"
  );
}

function mapPlaylistItem(raw: unknown): SpotifyTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  // Feb 2026: item; legacy: track
  const trackObj =
    (row.item && typeof row.item === "object" ? row.item : null) ??
    (row.track && typeof row.track === "object" ? row.track : null);
  if (!trackObj || typeof trackObj !== "object") return null;
  const track = trackObj as Record<string, unknown>;
  if (track.type && track.type !== "track") return null;
  const id = typeof track.id === "string" ? track.id : null;
  const uri = typeof track.uri === "string" ? track.uri : null;
  const name = typeof track.name === "string" ? track.name : null;
  const durationMs =
    typeof track.duration_ms === "number" ? track.duration_ms : null;
  if (!id || !uri || !name || durationMs == null || durationMs <= 0) return null;

  const primaryArtist = mapArtists(track.artists);

  const externalIds =
    track.external_ids && typeof track.external_ids === "object"
      ? (track.external_ids as Record<string, unknown>)
      : {};
  const isrc =
    typeof externalIds.isrc === "string" && externalIds.isrc.trim()
      ? externalIds.isrc.trim()
      : null;

  return { id, uri, name, durationMs, primaryArtist, isrc };
}

function mapSearchTrack(raw: unknown): SpotifySearchTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const track = raw as Record<string, unknown>;
  if (track.type && track.type !== "track") return null;
  const id = typeof track.id === "string" ? track.id : null;
  const uri = typeof track.uri === "string" ? track.uri : null;
  const name = typeof track.name === "string" ? track.name : null;
  const durationMs =
    typeof track.duration_ms === "number" ? track.duration_ms : null;
  if (!id || !uri || !name || durationMs == null) return null;

  const album =
    track.album && typeof track.album === "object"
      ? (track.album as Record<string, unknown>)
      : null;
  const albumName =
    album && typeof album.name === "string" ? album.name : null;
  const images = album && Array.isArray(album.images) ? album.images : [];
  let imageUrl: string | null = null;
  for (const img of images) {
    if (
      img &&
      typeof img === "object" &&
      typeof (img as { url?: unknown }).url === "string"
    ) {
      imageUrl = (img as { url: string }).url;
      break;
    }
  }

  return {
    id,
    uri,
    name,
    primaryArtist: mapArtists(track.artists),
    albumName,
    imageUrl,
    durationMs,
  };
}

/**
 * Fetch all playable tracks from a playlist.
 * Tries /items (Feb 2026) then falls back to /tracks.
 */
export async function fetchPlaylistTracks(
  accessToken: string,
  playlistId: string,
  options?: { dedupe?: boolean }
): Promise<SpotifyTrack[]> {
  const dedupe = options?.dedupe !== false;
  const tracks: SpotifyTrack[] = [];
  const tryPaths = [
    `/playlists/${playlistId}/items?limit=100`,
    `/playlists/${playlistId}/tracks?limit=100`,
  ];

  let path: string | null = null;
  let firstError: Error | null = null;

  for (const candidate of tryPaths) {
    try {
      const page = await spotifyFetch<{
        items?: unknown[];
        next?: string | null;
      }>(accessToken, candidate);
      path = candidate.split("?")[0];
      for (const item of page.items ?? []) {
        const mapped = mapPlaylistItem(item);
        if (mapped) tracks.push(mapped);
      }
      let next = page.next ?? null;
      while (next) {
        const url = new URL(next);
        const relative = `${url.pathname.replace(/^\/v1/, "")}${url.search}`;
        const nextPage = await spotifyFetch<{
          items?: unknown[];
          next?: string | null;
        }>(accessToken, relative);
        for (const item of nextPage.items ?? []) {
          const mapped = mapPlaylistItem(item);
          if (mapped) tracks.push(mapped);
        }
        next = nextPage.next ?? null;
      }
      break;
    } catch (err) {
      firstError = err instanceof Error ? err : new Error(String(err));
      // try next path
    }
  }

  if (!path) {
    throw firstError ?? new Error(`Failed to fetch playlist ${playlistId}`);
  }

  if (!dedupe) return tracks;

  // Dedupe by track id (playlists can contain duplicates)
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export async function fetchCurrentUserId(accessToken: string): Promise<string> {
  const me = await spotifyFetch<{ id: string }>(accessToken, "/me");
  return me.id;
}

export type SpotifyUserProduct = "premium" | "free" | "open";

export async function fetchSpotifyUserProfile(accessToken: string): Promise<{
  id: string;
  product: SpotifyUserProduct | null;
}> {
  const me = await spotifyFetch<{ id: string; product?: string }>(
    accessToken,
    "/me"
  );
  const productRaw = typeof me.product === "string" ? me.product : null;
  const product =
    productRaw === "premium" || productRaw === "free" || productRaw === "open"
      ? productRaw
      : null;
  return { id: me.id, product };
}

export async function createPrivatePlaylist(
  accessToken: string,
  name: string,
  description?: string
): Promise<{ id: string; url: string }> {
  const body = {
    name,
    description: description ?? "Generated by Country City Swing Social mixer",
    public: false,
  };

  // Prefer /me/playlists (Feb 2026); fallback to users/{id}/playlists
  try {
    const created = await spotifyFetch<{
      id: string;
      external_urls?: { spotify?: string };
    }>(accessToken, "/me/playlists", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      id: created.id,
      url:
        created.external_urls?.spotify ??
        `https://open.spotify.com/playlist/${created.id}`,
    };
  } catch {
    const userId = await fetchCurrentUserId(accessToken);
    const created = await spotifyFetch<{
      id: string;
      external_urls?: { spotify?: string };
    }>(accessToken, `/users/${encodeURIComponent(userId)}/playlists`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      id: created.id,
      url:
        created.external_urls?.spotify ??
        `https://open.spotify.com/playlist/${created.id}`,
    };
  }
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
  options?: { position?: number }
): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < trackUris.length; i += chunkSize) {
    const chunk = trackUris.slice(i, i + chunkSize);
    const body: { uris: string[]; position?: number } = { uris: chunk };
    if (options?.position != null && i === 0) {
      body.position = options.position;
    }
    // Feb 2026: /tracks write endpoints are removed (403). Use /items only.
    await spotifyFetch(accessToken, `/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

async function fetchPlaylistSnapshotId(
  accessToken: string,
  playlistId: string
): Promise<string | null> {
  const data = await spotifyFetch<{ snapshot_id?: string }>(
    accessToken,
    `/playlists/${playlistId}`
  );
  return typeof data.snapshot_id === "string" && data.snapshot_id
    ? data.snapshot_id
    : null;
}

/** Remove a single playlist item at a specific position. */
export async function removePlaylistItemAtPosition(
  accessToken: string,
  playlistId: string,
  trackUri: string,
  position: number
): Promise<void> {
  const snapshotId = await fetchPlaylistSnapshotId(accessToken, playlistId);
  // Feb 2026: body field is `items` (not `tracks`); /tracks DELETE returns 403.
  const body: {
    items: Array<{ uri: string; positions: number[] }>;
    snapshot_id?: string;
  } = {
    items: [{ uri: trackUri, positions: [position] }],
  };
  if (snapshotId) body.snapshot_id = snapshotId;

  await spotifyFetch(accessToken, `/playlists/${playlistId}/items`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

/** Replace the track at `position` with `newUri`. */
export async function replacePlaylistItemAtPosition(
  accessToken: string,
  playlistId: string,
  position: number,
  oldUri: string,
  newUri: string
): Promise<void> {
  await removePlaylistItemAtPosition(accessToken, playlistId, oldUri, position);
  await addTracksToPlaylist(accessToken, playlistId, [newUri], { position });
}

export async function searchTracks(
  accessToken: string,
  query: string,
  options?: { limit?: number }
): Promise<SpotifySearchTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 20);
  const params = new URLSearchParams({
    q,
    type: "track",
    limit: String(limit),
  });
  const data = await spotifyFetch<{
    tracks?: { items?: unknown[] };
  }>(accessToken, `/search?${params.toString()}`);
  const items = data.tracks?.items ?? [];
  const out: SpotifySearchTrack[] = [];
  for (const item of items) {
    const mapped = mapSearchTrack(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

export type CurrentlyPlaying = {
  trackId: string | null;
  trackUri: string | null;
  contextUri: string | null;
  isPlaying: boolean;
};

export async function getCurrentlyPlaying(
  accessToken: string
): Promise<CurrentlyPlaying | null> {
  try {
    const data = await spotifyFetch<{
      is_playing?: boolean;
      item?: { id?: string; uri?: string; type?: string } | null;
      context?: { uri?: string } | null;
    }>(accessToken, "/me/player/currently-playing");
    if (!data) return null;
    const item = data.item;
    const trackId =
      item && item.type === "track" && typeof item.id === "string"
        ? item.id
        : null;
    const trackUri = item && typeof item.uri === "string" ? item.uri : null;
    return {
      trackId,
      trackUri,
      contextUri: data.context?.uri ?? null,
      isPlaying: Boolean(data.is_playing),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/\(204\)|\(404\)/i.test(message)) return null;
    throw err;
  }
}

export async function fetchPlaylistMeta(
  accessToken: string,
  playlistId: string
): Promise<{ id: string; name: string; url: string; ownerId: string | null }> {
  const data = await spotifyFetch<{
    id: string;
    name?: string;
    external_urls?: { spotify?: string };
    owner?: { id?: string };
  }>(accessToken, `/playlists/${playlistId}`);
  return {
    id: data.id,
    name: data.name?.trim() || "Social playlist",
    url:
      data.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${playlistId}`,
    ownerId: typeof data.owner?.id === "string" ? data.owner.id : null,
  };
}

export type OwnedPlaylistSummary = {
  id: string;
  name: string;
  url: string;
  trackCount: number | null;
  public: boolean | null;
};

/**
 * List playlists owned by the authenticated Spotify user (editable).
 * Followed/collaborative playlists owned by others are excluded.
 */
export async function listOwnedPlaylists(
  accessToken: string,
  ownerUserId: string,
  options?: { limit?: number }
): Promise<OwnedPlaylistSummary[]> {
  type PlaylistPage = {
    items?: Array<{
      id?: string;
      name?: string;
      external_urls?: { spotify?: string };
      tracks?: { total?: number };
      public?: boolean | null;
      owner?: { id?: string };
    }>;
    next?: string | null;
  };

  const max = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const out: OwnedPlaylistSummary[] = [];
  let nextPath: string | null = `/me/playlists?limit=50`;

  while (nextPath && out.length < max) {
    const page: PlaylistPage = await spotifyFetch<PlaylistPage>(
      accessToken,
      nextPath
    );

    for (const item of page.items ?? []) {
      if (!item?.id || typeof item.id !== "string") continue;
      if (item.owner?.id !== ownerUserId) continue;
      out.push({
        id: item.id,
        name: item.name?.trim() || "Untitled playlist",
        url:
          item.external_urls?.spotify ??
          `https://open.spotify.com/playlist/${item.id}`,
        trackCount:
          typeof item.tracks?.total === "number" ? item.tracks.total : null,
        public: typeof item.public === "boolean" ? item.public : null,
      });
      if (out.length >= max) break;
    }

    if (!page.next || out.length >= max) {
      nextPath = null;
    } else {
      const nextUrl = new URL(page.next);
      nextPath = `${nextUrl.pathname.replace(/^\/v1/, "")}${nextUrl.search}`;
    }
  }

  out.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return out;
}
