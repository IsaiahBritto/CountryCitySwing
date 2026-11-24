import {
  classifyAppleMusicPath,
  logMusicApiFailure,
  MusicApiFetchError,
  parseAppleMusicErrorBody,
  parseRetryAfterSec,
} from "@/lib/music/apiDiagnostics";

const APPLE_MUSIC_API = "https://api.music.apple.com";

export function parseAppleMusicSuccessJson<T>(
  status: number,
  bodyText: string
): T {
  if (status === 204 || status === 205) {
    return undefined as T;
  }
  const trimmed = bodyText.trim();
  if (trimmed === "") {
    return undefined as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new MusicApiFetchError({
      message: "Apple Music API returned invalid JSON",
      httpStatus: status,
      path: "",
      method: "GET",
      provider: "apple_music",
    });
  }
}

export async function appleMusicApiFetch<T>(
  path: string,
  input: {
    developerToken: string;
    musicUserToken?: string | null;
    method?: string;
    body?: unknown;
    storefront?: string;
  }
): Promise<T> {
  const method = (input.method ?? "GET").toUpperCase();
  const url = path.startsWith("http") ? path : `${APPLE_MUSIC_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.developerToken}`,
    Accept: "application/json",
  };
  if (input.musicUserToken?.trim()) {
    headers["Music-User-Token"] = input.musicUserToken.trim();
  }

  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers:
      input.body != null
        ? { ...headers, "Content-Type": "application/json" }
        : headers,
    body: input.body != null ? JSON.stringify(input.body) : undefined,
  });
  const durationMs = Date.now() - started;

  if (!res.ok) {
    const retryAfterSec = parseRetryAfterSec(res);
    const { message, body } = await parseAppleMusicErrorBody(res);
    logMusicApiFailure({
      provider: "apple_music",
      path: classifyAppleMusicPath(path, method),
      method,
      httpStatus: res.status,
      durationMs,
      retryAfterSec,
      errorMessage: message,
    });
    throw new MusicApiFetchError({
      message,
      httpStatus: res.status,
      path,
      method,
      provider: "apple_music",
      retryAfterSec,
      responseBody: body,
    });
  }

  logMusicApiFailure({
    provider: "apple_music",
    path: classifyAppleMusicPath(path, method),
    method,
    httpStatus: res.status,
    durationMs,
  });

  const bodyText = await res.text();
  try {
    return parseAppleMusicSuccessJson<T>(res.status, bodyText);
  } catch (error) {
    if (error instanceof MusicApiFetchError) {
      throw new MusicApiFetchError({
        message: error.message,
        httpStatus: res.status,
        path,
        method,
        provider: "apple_music",
      });
    }
    throw error;
  }
}
