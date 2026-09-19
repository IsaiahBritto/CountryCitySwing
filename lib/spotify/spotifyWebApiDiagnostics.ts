/** Server-side logging for Spotify Web API failures (never log secrets). */

const SENSITIVE_JSON_KEYS = new Set([
  "access_token",
  "refresh_token",
  "client_secret",
  "authorization",
  "token",
]);

type SpotifyErrorBody = {
  error?: {
    message?: string;
    status?: number;
    reason?: string;
  };
};

function redactSensitiveJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveJson);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_JSON_KEYS.has(key.toLowerCase())) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactSensitiveJson(nested);
      }
    }
    return out;
  }
  return value;
}

/** Parse error body once; safe for logging and user-facing messages. */
export function parseSpotifyWebApiErrorBody(responseText: string): {
  message: string;
  reason: string | null;
  /** Parsed JSON for logs, with sensitive fields redacted; null if not JSON. */
  logBody: unknown | null;
} {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return { message: "", reason: null, logBody: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as SpotifyErrorBody;
    const redacted = redactSensitiveJson(parsed);
    const reason =
      typeof parsed.error?.reason === "string" && parsed.error.reason.trim()
        ? parsed.error.reason.trim()
        : null;
    const message =
      typeof parsed.error?.message === "string" && parsed.error.message.trim()
        ? parsed.error.message.trim()
        : trimmed;
    return { message, reason, logBody: redacted };
  } catch {
    return { message: trimmed, reason: null, logBody: trimmed };
  }
}

/** Collect Retry-After and any rate-limit / quota related response headers present. */
export function collectSpotifyRateLimitHeaders(
  headers: Headers
): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "retry-after" ||
      lower.includes("rate") ||
      lower.includes("quota") ||
      lower.includes("limit")
    ) {
      out[key] = value;
    }
  });
  return out;
}

export type LogSpotifyWebApiErrorInput = {
  method: string;
  /** Path under /v1, e.g. `/me/playlists?limit=50` */
  path: string;
  status: number;
  responseText: string;
  headers: Headers;
};

/** Log diagnostic details for non-2xx Spotify Web API responses. */
export function logSpotifyWebApiError(input: LogSpotifyWebApiErrorInput): void {
  const { message, reason, logBody } = parseSpotifyWebApiErrorBody(
    input.responseText
  );
  const rateLimitHeaders = collectSpotifyRateLimitHeaders(input.headers);
  const retryAfter = input.headers.get("retry-after");

  const payload = {
    spotifyPath: input.path,
    spotifyUrl: `https://api.spotify.com/v1${input.path}`,
    method: input.method.toUpperCase(),
    httpStatus: input.status,
    responseBody: logBody ?? (input.responseText || null),
    retryAfter,
    rateLimitHeaders,
    errorReason: reason,
    errorMessage: message || null,
  };

  if (input.status === 429) {
    console.error("Spotify Web API rate limited (429):", payload);
  } else {
    console.error("Spotify Web API request failed:", payload);
  }
}

export function spotifyWebApiFailureMessage(
  path: string,
  status: number,
  responseText: string,
  statusText: string
): string {
  const { message } = parseSpotifyWebApiErrorBody(responseText);
  const detail = message || responseText || statusText;
  return `Spotify API ${path} failed (${status}): ${detail}`;
}
