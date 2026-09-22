import { supabaseServer } from "@/lib/supabaseServer";
import { isEssentialSpotifyPath } from "@/lib/spotify/spotifyApiFetchError";

const STATE_ID = "default";
const MAX_RETRY_AFTER_SEC = 24 * 60 * 60;

export class SpotifyQuotaBlockedError extends Error {
  readonly blockedUntil: Date;
  readonly code = "SPOTIFY_QUOTA_EXCEEDED" as const;

  constructor(blockedUntil: Date, message?: string) {
    super(
      message ??
        `Spotify Development Mode quota is exhausted until ${blockedUntil.toISOString()}`
    );
    this.name = "SpotifyQuotaBlockedError";
    this.blockedUntil = blockedUntil;
  }
}

export type SpotifyQuotaState = {
  quotaBlockedUntil: Date | null;
  last429At: Date | null;
  lastRetryAfterSec: number | null;
  lastPath: string | null;
};

export async function loadSpotifyQuotaState(): Promise<SpotifyQuotaState> {
  const { data, error } = await supabaseServer
    .from("spotify_api_state")
    .select(
      "quota_blocked_until, last_429_at, last_retry_after_sec, last_path"
    )
    .eq("id", STATE_ID)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load spotify_api_state:", error.message);
    return {
      quotaBlockedUntil: null,
      last429At: null,
      lastRetryAfterSec: null,
      lastPath: null,
    };
  }

  return {
    quotaBlockedUntil: data?.quota_blocked_until
      ? new Date(data.quota_blocked_until)
      : null,
    last429At: data?.last_429_at ? new Date(data.last_429_at) : null,
    lastRetryAfterSec:
      typeof data?.last_retry_after_sec === "number"
        ? data.last_retry_after_sec
        : null,
    lastPath: typeof data?.last_path === "string" ? data.last_path : null,
  };
}

export async function recordQuotaExceededFromResponse(input: {
  path: string;
  retryAfterSec: number | null;
  reason: string | null;
}): Promise<void> {
  const retrySec = Math.min(
    Math.max(input.retryAfterSec ?? 60, 1),
    MAX_RETRY_AFTER_SEC
  );
  const blockedUntil = new Date(Date.now() + retrySec * 1000);
  const now = new Date().toISOString();

  const { error } = await supabaseServer.from("spotify_api_state").upsert(
    {
      id: STATE_ID,
      quota_blocked_until: blockedUntil.toISOString(),
      last_429_at: now,
      last_retry_after_sec: retrySec,
      last_path: input.path,
      updated_at: now,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("Failed to persist spotify quota state:", error.message);
  }
}

export async function clearSpotifyQuotaBlockIfExpired(): Promise<void> {
  const state = await loadSpotifyQuotaState();
  if (!state.quotaBlockedUntil) return;
  if (state.quotaBlockedUntil.getTime() > Date.now()) return;

  const now = new Date().toISOString();
  await supabaseServer
    .from("spotify_api_state")
    .update({ quota_blocked_until: null, updated_at: now })
    .eq("id", STATE_ID);
}

export async function assertSpotifyApiAllowed(
  path: string,
  method: string
): Promise<void> {
  await clearSpotifyQuotaBlockIfExpired();
  const state = await loadSpotifyQuotaState();
  if (!state.quotaBlockedUntil) return;
  if (state.quotaBlockedUntil.getTime() <= Date.now()) return;

  if (isEssentialSpotifyPath(path, method)) {
    return;
  }

  throw new SpotifyQuotaBlockedError(state.quotaBlockedUntil);
}

export async function getQuotaBlockedUntilIso(): Promise<string | null> {
  const state = await loadSpotifyQuotaState();
  if (!state.quotaBlockedUntil) return null;
  if (state.quotaBlockedUntil.getTime() <= Date.now()) return null;
  return state.quotaBlockedUntil.toISOString();
}
