import type { DjMusicProvider } from "@/lib/dj/musicProvider";
import {
  envMusicProviderOverride,
  getEffectiveMusicProvider,
} from "@/lib/music/platformSettings";

/** @deprecated Prefer async getServerMusicProvider(). Env-only fallback for legacy sync callers. */
export function serverMusicProvider(): DjMusicProvider {
  return envMusicProviderOverride() ?? "spotify";
}

export async function getServerMusicProvider(): Promise<DjMusicProvider> {
  const { provider } = await getEffectiveMusicProvider();
  return provider;
}

export async function isServerAppleMusic(): Promise<boolean> {
  return (await getServerMusicProvider()) === "apple_music";
}
