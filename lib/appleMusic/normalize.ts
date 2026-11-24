import { appleMusicSongUri } from "@/lib/music/trackIdentity";
import type { NormalizedTrack } from "@/lib/music/types";
import type { MusicKitMediaItem } from "@/lib/appleMusic/musicKitTypes";
import type { DeckTrack } from "@/lib/spotify/djDeckState";

type AppleSongResource = {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    genreNames?: string[];
    artwork?: { url?: string };
    playParams?: { id?: string; catalogId?: string; isLibrary?: boolean };
  };
};

function artworkUrlFromTemplate(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace("{w}", "300").replace("{h}", "300");
}

export function normalizeAppleSongResource(
  raw: AppleSongResource,
  opts?: { libraryId?: string }
): NormalizedTrack | null {
  const id = raw.id?.trim();
  if (!id) return null;
  const attrs = raw.attributes ?? {};
  const catalogId =
    attrs.playParams?.catalogId ??
    (attrs.playParams?.isLibrary ? undefined : id);
  const libraryId = opts?.libraryId ?? (attrs.playParams?.isLibrary ? id : undefined);

  return {
    provider: "apple_music",
    catalogId: catalogId ?? id,
    libraryId,
    isrc: attrs.isrc?.trim().toUpperCase() ?? null,
    title: attrs.name?.trim() || "Unknown",
    artist: attrs.artistName?.trim() || "Unknown",
    album: attrs.albumName?.trim(),
    artworkUrl: artworkUrlFromTemplate(attrs.artwork?.url),
    durationMs:
      typeof attrs.durationInMillis === "number" ? attrs.durationInMillis : undefined,
    genreNames: attrs.genreNames,
    playable: true,
  };
}

export function normalizeMusicKitMediaItem(
  item: MusicKitMediaItem | null | undefined
): NormalizedTrack | null {
  if (!item?.id) return null;
  return normalizeAppleSongResource(item as AppleSongResource);
}

export function normalizedTrackToDeckTrack(track: NormalizedTrack): DeckTrack {
  const id = track.catalogId ?? track.libraryId ?? "";
  return {
    id,
    uri: appleMusicSongUri(id),
    name: track.title,
    primaryArtist: track.artist,
    durationMs: track.durationMs ?? 0,
    isrc: track.isrc ?? null,
  };
}

export function deckTrackFromAppleSongResource(raw: AppleSongResource): DeckTrack | null {
  const normalized = normalizeAppleSongResource(raw);
  if (!normalized) return null;
  return normalizedTrackToDeckTrack(normalized);
}
