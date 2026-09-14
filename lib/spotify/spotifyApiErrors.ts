export type SpotifyPlayerErrorCode =
  | "DEVICE_NOT_FOUND"
  | "SCOPE_MISSING"
  | "PREMIUM_REQUIRED"
  | "SESSION_EXPIRED"
  | "RECONNECT_REQUIRED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export type SpotifyPlayerErrorAction =
  | "reconnect_spotify"
  | "sign_in"
  | "reconnect_deck";

export type SpotifyPlayerError = {
  code: SpotifyPlayerErrorCode;
  title: string;
  message: string;
  action?: SpotifyPlayerErrorAction;
};

export class SpotifyPlayerErrorException extends Error {
  readonly spotifyError: SpotifyPlayerError;

  constructor(spotifyError: SpotifyPlayerError) {
    super(spotifyError.message);
    this.name = "SpotifyPlayerErrorException";
    this.spotifyError = spotifyError;
  }
}

function nestedSpotifyMessage(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      try {
        return nestedSpotifyMessage(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (obj.error && typeof obj.error === "object") {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
    if (typeof obj.error === "string") return obj.error;
  }

  return null;
}

function mapMessageToError(message: string, status?: number): SpotifyPlayerError {
  const lower = message.toLowerCase();

  if (
    lower.includes("device not found") ||
    lower.includes("device not active")
  ) {
    return {
      code: "DEVICE_NOT_FOUND",
      title: "Playback device unavailable",
      message:
        "Spotify lost this browser device. Playback will reconnect before the next track.",
      action: "reconnect_deck",
    };
  }

  if (
    lower.includes("invalid token scopes") ||
    lower.includes("scope") ||
    lower.includes("reconnect required for dj deck")
  ) {
    return {
      code: "SCOPE_MISSING",
      title: "Spotify permissions need updating",
      message:
        "Reconnect Spotify on /spotify to grant playback permissions (streaming, user-read-email).",
      action: "reconnect_spotify",
    };
  }

  if (
    lower.includes("premium") ||
    lower.includes("restricted to premium")
  ) {
    return {
      code: "PREMIUM_REQUIRED",
      title: "Spotify Premium required",
      message: "In-browser DJ playback requires a Spotify Premium account.",
    };
  }

  if (
    lower.includes("session expired") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid token") ||
    status === 401
  ) {
    return {
      code: "SESSION_EXPIRED",
      title: "Session expired",
      message: "Sign in again to continue controlling playback.",
      action: "sign_in",
    };
  }

  if (
    lower.includes("not connected") ||
    lower.includes("needsdeckreconnect") ||
    lower.includes("reconnect spotify")
  ) {
    return {
      code: "RECONNECT_REQUIRED",
      title: "Spotify reconnect required",
      message: "Reconnect Spotify on /spotify to restore DJ deck playback.",
      action: "reconnect_spotify",
    };
  }

  if (lower.includes("rate limit") || status === 429) {
    return {
      code: "RATE_LIMITED",
      title: "Spotify is busy",
      message: "Too many requests — wait a moment and try again.",
    };
  }

  return {
    code: "UNKNOWN",
    title: "Playback error",
    message: message || "Something went wrong with Spotify playback.",
    action: "reconnect_deck",
  };
}

/** Parse API error payloads into a user-facing SpotifyPlayerError. */
export function parseSpotifyApiError(
  raw: unknown,
  status?: number
): SpotifyPlayerError {
  if (raw && typeof raw === "object" && "code" in raw && "title" in raw) {
    const structured = raw as SpotifyPlayerError;
    if (structured.code && structured.title && structured.message) {
      return structured;
    }
  }

  const message = nestedSpotifyMessage(raw);
  if (message) {
    return mapMessageToError(message, status);
  }

  if (typeof raw === "string" && raw.trim()) {
    return mapMessageToError(raw.trim(), status);
  }

  return {
    code: "UNKNOWN",
    title: "Playback error",
    message: "Something went wrong with Spotify playback.",
    action: "reconnect_deck",
  };
}

/** Build a structured error JSON body for API routes. */
export function spotifyErrorResponse(
  raw: unknown,
  status: number
): { error: SpotifyPlayerError; status: number } {
  return {
    error: parseSpotifyApiError(raw, status),
    status,
  };
}
