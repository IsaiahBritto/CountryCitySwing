export type SpotifyApiErrorReason =
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | string
  | null;

export type SpotifyApiErrorBody = {
  error?: {
    message?: string;
    status?: number;
    reason?: string;
  };
};

export class SpotifyApiFetchError extends Error {
  readonly httpStatus: number;
  readonly spotifyPath: string;
  readonly method: string;
  readonly errorReason: SpotifyApiErrorReason;
  readonly retryAfterSec: number | null;
  readonly responseBody: unknown;

  constructor(input: {
    message: string;
    httpStatus: number;
    spotifyPath: string;
    method: string;
    errorReason?: SpotifyApiErrorReason;
    retryAfterSec?: number | null;
    responseBody?: unknown;
  }) {
    super(input.message);
    this.name = "SpotifyApiFetchError";
    this.httpStatus = input.httpStatus;
    this.spotifyPath = input.spotifyPath;
    this.method = input.method;
    this.errorReason = input.errorReason ?? null;
    this.retryAfterSec = input.retryAfterSec ?? null;
    this.responseBody = input.responseBody;
  }

  get isQuotaExceeded(): boolean {
    return (
      this.httpStatus === 429 &&
      (this.errorReason === "QUOTA_EXCEEDED" ||
        this.message.toLowerCase().includes("quota"))
    );
  }

  get isRateLimited(): boolean {
    return this.httpStatus === 429;
  }
}

export function parseSpotifyErrorBody(text: string): {
  message: string;
  reason: SpotifyApiErrorReason;
  body: unknown;
} {
  let body: unknown = text;
  let message = text.trim() || "Spotify API error";
  let reason: SpotifyApiErrorReason = null;
  try {
    const parsed = JSON.parse(text) as SpotifyApiErrorBody;
    body = parsed;
    if (parsed.error?.message) message = parsed.error.message;
    if (typeof parsed.error?.reason === "string") {
      reason = parsed.error.reason;
    }
  } catch {
    // keep text
  }
  return { message, reason, body };
}

export function classifyEndpointGroup(path: string, method: string): string {
  const m = method.toUpperCase();
  const p = path.split("?")[0] ?? path;
  if (p === "/me/playlists" || p.startsWith("/me/playlists")) return "playlists_list";
  if (p.includes("/items") || p.includes("/tracks")) {
    if (m === "GET") return "playlist_tracks";
    return "playlist_mutate";
  }
  if (p.startsWith("/playlists/") && m === "GET") return "playlist_meta";
  if (p.startsWith("/me/player")) return "player";
  if (p.startsWith("/search")) return "search";
  if (p === "/me") return "me";
  return "other";
}

export function isEssentialSpotifyPath(path: string, method: string): boolean {
  const m = method.toUpperCase();
  const p = path.split("?")[0] ?? path;
  if (p.startsWith("/me/player") && m !== "GET") return true;
  return false;
}

export function logSpotifyWebApiFailure(input: {
  spotifyPath: string;
  method: string;
  httpStatus: number;
  responseBody: unknown;
  retryAfterSec: number | null;
  errorReason: SpotifyApiErrorReason;
  errorMessage: string;
  rateLimitHeaders: Record<string, string>;
}): void {
  console.warn(
    "Spotify Web API rate limited or failed:",
    JSON.stringify({
      spotifyPath: input.spotifyPath,
      spotifyUrl: `https://api.spotify.com/v1${input.spotifyPath}`,
      method: input.method,
      httpStatus: input.httpStatus,
      responseBody: input.responseBody,
      retryAfter: input.retryAfterSec != null ? String(input.retryAfterSec) : null,
      rateLimitHeaders: input.rateLimitHeaders,
      errorReason: input.errorReason,
      errorMessage: input.errorMessage,
    })
  );
}

export function isSpotifyApiFetchError(err: unknown): err is SpotifyApiFetchError {
  return err instanceof SpotifyApiFetchError;
}

export function shouldSkipPlaylistTracksFallback(err: unknown): boolean {
  if (!isSpotifyApiFetchError(err)) {
    const message = err instanceof Error ? err.message : String(err);
    return /\(429\)/.test(message);
  }
  return err.isRateLimited;
}

function parseRetryAfterSec(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function redactHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ]) {
    const v = headers.get(key);
    if (v) out[key] = v;
  }
  return out;
}

export async function spotifyWebApiFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const { incrementUsageRollup } = await import("@/lib/spotify/spotifyUsageMetrics");
  const {
    assertSpotifyApiAllowed,
    recordQuotaExceededFromResponse,
    SpotifyQuotaBlockedError,
  } = await import("@/lib/spotify/spotifyQuotaGate");

  const method = (init?.method ?? "GET").toUpperCase();
  const spotifyPath = path.startsWith("/") ? path : `/${path}`;
  const group = classifyEndpointGroup(spotifyPath, method);

  try {
    await assertSpotifyApiAllowed(spotifyPath, method);
  } catch (err) {
    if (err instanceof SpotifyQuotaBlockedError) {
      await incrementUsageRollup(group, "blocked_local");
    }
    throw err;
  }

  const res = await fetch(`https://api.spotify.com/v1${spotifyPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const { message, reason, body } = parseSpotifyErrorBody(text);
    const retryAfterSec = parseRetryAfterSec(res);
    const rateLimitHeaders = redactHeaders(res.headers);

    if (res.status === 429) {
      logSpotifyWebApiFailure({
        spotifyPath,
        method,
        httpStatus: res.status,
        responseBody: body,
        retryAfterSec,
        errorReason: reason,
        errorMessage: message,
        rateLimitHeaders,
      });
      await recordQuotaExceededFromResponse({
        path: spotifyPath,
        retryAfterSec,
        reason,
      });
      await incrementUsageRollup(group, "429");
    }

    throw new SpotifyApiFetchError({
      message: `Spotify API ${spotifyPath} failed (${res.status}): ${message}`,
      httpStatus: res.status,
      spotifyPath,
      method,
      errorReason: reason,
      retryAfterSec,
      responseBody: body,
    });
  }

  await incrementUsageRollup(group, "ok");

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
