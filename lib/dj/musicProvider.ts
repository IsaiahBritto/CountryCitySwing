export type DjMusicProvider = "apple_music" | "spotify";

/** Env-only fallback before client platform fetch. Prefer useMusicPlatform() in UI. */
export function getDjMusicProvider(): DjMusicProvider {
  const raw = process.env.NEXT_PUBLIC_MUSIC_PROVIDER?.trim().toLowerCase();
  if (raw === "apple_music" || raw === "apple-music") return "apple_music";
  return "spotify";
}

export function isAppleMusicDeck(): boolean {
  return getDjMusicProvider() === "apple_music";
}
