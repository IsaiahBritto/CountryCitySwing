import type { DjMusicProvider } from "@/lib/dj/musicProvider";
import { supabaseServer } from "@/lib/supabaseServer";

const ROW_ID = "default";
const CACHE_TTL_MS = 5_000;

type Cached = { provider: DjMusicProvider; expiresAt: number };
let cached: Cached | null = null;

export type MusicProviderSource = "env" | "database";

export function parseMusicProvider(raw: string | undefined | null): DjMusicProvider | null {
  const v = raw?.trim().toLowerCase();
  if (v === "spotify") return "spotify";
  if (v === "apple_music" || v === "apple-music") return "apple_music";
  return null;
}

export function envMusicProviderOverride(): DjMusicProvider | null {
  return parseMusicProvider(process.env.MUSIC_PROVIDER);
}

export async function getStoredMusicPlatformProvider(): Promise<DjMusicProvider> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.provider;
  }

  const { data, error } = await supabaseServer
    .from("music_platform_settings")
    .select("provider")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    console.warn("music_platform_settings read failed:", error.message);
  }

  const provider = parseMusicProvider(data?.provider as string | undefined) ?? "spotify";
  cached = { provider, expiresAt: now + CACHE_TTL_MS };
  return provider;
}

export function invalidateMusicPlatformProviderCache(): void {
  cached = null;
}

export async function getEffectiveMusicProvider(): Promise<{
  provider: DjMusicProvider;
  source: MusicProviderSource;
}> {
  const fromEnv = envMusicProviderOverride();
  if (fromEnv) {
    return { provider: fromEnv, source: "env" };
  }
  const provider = await getStoredMusicPlatformProvider();
  return { provider, source: "database" };
}

export async function setStoredMusicPlatformProvider(input: {
  provider: DjMusicProvider;
  updatedBy: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer.from("music_platform_settings").upsert(
    {
      id: ROW_ID,
      provider: input.provider,
      updated_at: now,
      updated_by: input.updatedBy,
    },
    { onConflict: "id" }
  );
  if (error) {
    throw new Error(`Failed to save music platform setting: ${error.message}`);
  }
  invalidateMusicPlatformProviderCache();
}
