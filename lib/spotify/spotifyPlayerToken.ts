import { apiError, authedFetchWithRetry } from "@/lib/clientAuth";
import { parseSpotifyApiError } from "@/lib/spotify/spotifyApiErrors";
import {
  isTokenCacheValid,
  proactiveRefreshDelayMs,
  TOKEN_FETCH_BACKOFF_MS,
} from "@/lib/spotify/spotifyPlayerLifecycle";

export type PlayerTokenCache = {
  accessToken: string;
  expiresAt: string;
};

export type FetchPlayerTokenResult =
  | { ok: true; token: PlayerTokenCache }
  | { ok: false; error: string; structuredError: ReturnType<typeof parseSpotifyApiError> };

export type SpotifyPlayerTokenManagerOptions = {
  fetchImpl?: typeof authedFetchWithRetry;
  sleep?: (ms: number) => Promise<void>;
  onPersistentFailure?: (error: ReturnType<typeof parseSpotifyApiError>) => void;
  onRefreshSuccess?: (token: PlayerTokenCache) => void;
};

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPlayerTokenOnce(
  fetchImpl: typeof authedFetchWithRetry = authedFetchWithRetry
): Promise<FetchPlayerTokenResult> {
  const res = await fetchImpl("/api/spotify/player-token");
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const raw =
      (body as { error?: unknown }).error ??
      (await apiError(res));
    const structuredError = parseSpotifyApiError(raw, res.status);
    const message =
      typeof raw === "string"
        ? raw
        : structuredError.message;
    return { ok: false, error: message, structuredError };
  }

  const accessToken = (body as { accessToken?: string }).accessToken;
  const expiresAt = (body as { expiresAt?: string }).expiresAt;
  if (!accessToken || !expiresAt) {
    const structuredError = parseSpotifyApiError(
      "Invalid player token response",
      500
    );
    return {
      ok: false,
      error: structuredError.message,
      structuredError,
    };
  }

  return {
    ok: true,
    token: { accessToken, expiresAt },
  };
}

export async function fetchPlayerTokenWithRetry(
  options: SpotifyPlayerTokenManagerOptions = {}
): Promise<FetchPlayerTokenResult> {
  const fetchImpl = options.fetchImpl ?? authedFetchWithRetry;
  const sleep = options.sleep ?? defaultSleep;

  let lastResult: FetchPlayerTokenResult | null = null;

  for (let attempt = 0; attempt < TOKEN_FETCH_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(TOKEN_FETCH_BACKOFF_MS[attempt]);
    }

    const result = await fetchPlayerTokenOnce(fetchImpl);
    if (result.ok) {
      return result;
    }
    lastResult = result;
  }

  if (lastResult && !lastResult.ok) {
    options.onPersistentFailure?.(lastResult.structuredError);
  }

  return lastResult ?? {
    ok: false,
    error: "Failed to load player token",
    structuredError: parseSpotifyApiError("Failed to load player token", 500),
  };
}

export class SpotifyPlayerTokenManager {
  private cache: PlayerTokenCache | null = null;
  private proactiveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchImpl: typeof authedFetchWithRetry;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onPersistentFailure?: (
    error: ReturnType<typeof parseSpotifyApiError>
  ) => void;
  private readonly onRefreshSuccess?: (token: PlayerTokenCache) => void;

  constructor(options: SpotifyPlayerTokenManagerOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? authedFetchWithRetry;
    this.sleep = options.sleep ?? defaultSleep;
    this.onPersistentFailure = options.onPersistentFailure;
    this.onRefreshSuccess = options.onRefreshSuccess;
  }

  getCachedToken(): string | null {
    if (!this.cache) return null;
    if (!isTokenCacheValid(this.cache.expiresAt)) return null;
    return this.cache.accessToken;
  }

  getCache(): PlayerTokenCache | null {
    if (!this.cache) return null;
    if (!isTokenCacheValid(this.cache.expiresAt)) return null;
    return this.cache;
  }

  clearCache(): void {
    this.cache = null;
    this.clearProactiveTimer();
  }

  clearProactiveTimer(): void {
    if (this.proactiveTimer) {
      clearTimeout(this.proactiveTimer);
      this.proactiveTimer = null;
    }
  }

  scheduleProactiveRefresh(): void {
    this.clearProactiveTimer();
    const delay = proactiveRefreshDelayMs(this.cache?.expiresAt ?? null);
    this.proactiveTimer = setTimeout(() => {
      void this.refresh({ background: true });
    }, delay);
  }

  async getToken(): Promise<FetchPlayerTokenResult> {
    const cached = this.getCachedToken();
    if (cached && this.cache) {
      return { ok: true, token: this.cache };
    }
    return this.refresh();
  }

  async refresh(options?: { background?: boolean }): Promise<FetchPlayerTokenResult> {
    const result = await fetchPlayerTokenWithRetry({
      fetchImpl: this.fetchImpl,
      sleep: this.sleep,
      onPersistentFailure: (error) => {
        if (!options?.background) {
          this.onPersistentFailure?.(error);
        } else {
          this.onPersistentFailure?.(error);
        }
      },
    });

    if (result.ok) {
      this.cache = result.token;
      this.onRefreshSuccess?.(result.token);
      this.scheduleProactiveRefresh();
    }

    return result;
  }
}
