import type { DjMusicProvider } from "@/lib/dj/musicProvider";
import { getDjMusicProvider, isAppleMusicDeck } from "@/lib/dj/musicProvider";

function isApple(provider: DjMusicProvider): boolean {
  return provider === "apple_music";
}

export function musicStatusPathFor(provider: DjMusicProvider): string {
  return isApple(provider) ? "/api/apple-music/status" : "/api/spotify/status";
}

export function musicPlaylistsPathFor(
  provider: DjMusicProvider,
  options?: { force?: boolean }
): string {
  const base = isApple(provider)
    ? "/api/apple-music/playlists"
    : "/api/spotify/playlists";
  if (options?.force && isApple(provider)) {
    return `${base}?force=1`;
  }
  return base;
}

export function musicPlaylistTracksPathFor(
  provider: DjMusicProvider,
  playlistId: string
): string {
  return isApple(provider)
    ? `/api/apple-music/playlists/${encodeURIComponent(playlistId)}/tracks`
    : `/api/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`;
}

export function musicActiveDeckTracksPathFor(provider: DjMusicProvider): string {
  return isApple(provider)
    ? "/api/apple-music/active-playlist/deck-tracks"
    : "/api/spotify/active-playlist/deck-tracks";
}

export function musicSearchPathFor(provider: DjMusicProvider): string {
  return isApple(provider) ? "/api/apple-music/search" : "/api/social/search";
}

export function musicActivePlaylistPathFor(provider: DjMusicProvider): string {
  return isApple(provider)
    ? "/api/apple-music/active-playlist"
    : "/api/spotify/active-playlist";
}

export function musicGeneratePathFor(provider: DjMusicProvider): string {
  return isApple(provider)
    ? "/api/apple-music/generate"
    : "/api/spotify/generate";
}

/** @deprecated Use musicStatusPathFor with useMusicPlatform().provider */
export function musicStatusPath(): string {
  return musicStatusPathFor(
    isAppleMusicDeck() ? "apple_music" : getDjMusicProvider()
  );
}

/** @deprecated Use musicPlaylistsPathFor with useMusicPlatform().provider */
export function musicPlaylistsPath(options?: { force?: boolean }): string {
  const provider = isAppleMusicDeck() ? "apple_music" : getDjMusicProvider();
  return musicPlaylistsPathFor(provider, options);
}

/** @deprecated Use musicPlaylistTracksPathFor with useMusicPlatform().provider */
export function musicPlaylistTracksPath(playlistId: string): string {
  const provider = isAppleMusicDeck() ? "apple_music" : getDjMusicProvider();
  return musicPlaylistTracksPathFor(provider, playlistId);
}

/** @deprecated Use musicActiveDeckTracksPathFor with useMusicPlatform().provider */
export function musicActiveDeckTracksPath(): string {
  const provider = isAppleMusicDeck() ? "apple_music" : getDjMusicProvider();
  return musicActiveDeckTracksPathFor(provider);
}

/** @deprecated Use musicSearchPathFor with useMusicPlatform().provider */
export function musicSearchPath(): string {
  const provider = isAppleMusicDeck() ? "apple_music" : getDjMusicProvider();
  return musicSearchPathFor(provider);
}

/** @deprecated Use musicActivePlaylistPathFor with useMusicPlatform().provider */
export function musicActivePlaylistPath(): string {
  const provider = isAppleMusicDeck() ? "apple_music" : getDjMusicProvider();
  return musicActivePlaylistPathFor(provider);
}

/** @deprecated Use musicGeneratePathFor with useMusicPlatform().provider */
export function musicGeneratePath(): string {
  const provider = isAppleMusicDeck() ? "apple_music" : getDjMusicProvider();
  return musicGeneratePathFor(provider);
}

export function createMusicApiPaths(provider: DjMusicProvider) {
  return {
    musicStatusPath: () => musicStatusPathFor(provider),
    musicPlaylistsPath: (options?: { force?: boolean }) =>
      musicPlaylistsPathFor(provider, options),
    musicPlaylistTracksPath: (playlistId: string) =>
      musicPlaylistTracksPathFor(provider, playlistId),
    musicActiveDeckTracksPath: () => musicActiveDeckTracksPathFor(provider),
    musicSearchPath: () => musicSearchPathFor(provider),
    musicActivePlaylistPath: () => musicActivePlaylistPathFor(provider),
    musicGeneratePath: () => musicGeneratePathFor(provider),
  };
}
