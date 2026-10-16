import type { DjMusicProvider } from "@/lib/dj/musicProvider";

export type MusicProviderUrlSegment = "spotify" | "apple-music";

export function providerToUrlSegment(provider: DjMusicProvider): MusicProviderUrlSegment {
  return provider === "apple_music" ? "apple-music" : "spotify";
}

export function urlSegmentToProvider(segment: string): DjMusicProvider | null {
  const s = segment.trim().toLowerCase();
  if (s === "spotify") return "spotify";
  if (s === "apple-music" || s === "apple_music") return "apple_music";
  return null;
}

export function musicAdminPath(provider: DjMusicProvider): string {
  return `/admin/music/${providerToUrlSegment(provider)}`;
}

export function musicDeckPath(provider: DjMusicProvider): string {
  return `/music/deck/${providerToUrlSegment(provider)}`;
}
