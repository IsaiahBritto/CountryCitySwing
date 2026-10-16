export type MusicApiProvider = "apple_music";

export class MusicApiFetchError extends Error {
  readonly httpStatus: number;
  readonly path: string;
  readonly method: string;
  readonly provider: MusicApiProvider;
  readonly retryAfterSec: number | null;
  readonly responseBody: unknown;

  constructor(input: {
    message: string;
    httpStatus: number;
    path: string;
    method: string;
    provider: MusicApiProvider;
    retryAfterSec?: number | null;
    responseBody?: unknown;
  }) {
    super(input.message);
    this.name = "MusicApiFetchError";
    this.httpStatus = input.httpStatus;
    this.path = input.path;
    this.method = input.method;
    this.provider = input.provider;
    this.retryAfterSec = input.retryAfterSec ?? null;
    this.responseBody = input.responseBody;
  }

  get isRateLimited(): boolean {
    return this.httpStatus === 429;
  }
}

export function parseRetryAfterSec(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function classifyAppleMusicPath(path: string, method: string): string {
  const m = method.toUpperCase();
  const p = path.split("?")[0] ?? path;
  if (p.includes("/me/library/playlists")) return "library_playlists";
  if (p.includes("/catalog/") && p.includes("/search")) return "catalog_search";
  if (p.includes("/songs")) return "songs";
  if (p.startsWith("/v1/me")) return "me";
  return "other";
}

export function logMusicApiFailure(input: {
  provider: MusicApiProvider;
  path: string;
  method: string;
  httpStatus: number;
  durationMs: number;
  retryAfterSec?: number | null;
  cacheHit?: boolean;
  errorMessage?: string;
}): void {
  console.info(
    "Music API:",
    JSON.stringify({
      provider: input.provider,
      path: input.path,
      method: input.method,
      httpStatus: input.httpStatus,
      durationMs: input.durationMs,
      retryAfterSec: input.retryAfterSec ?? null,
      cacheHit: input.cacheHit ?? false,
      errorMessage: input.errorMessage ?? null,
    })
  );
}

export async function parseAppleMusicErrorBody(
  res: Response
): Promise<{ message: string; body: unknown }> {
  const text = await res.text();
  let body: unknown = text;
  let message = text.trim() || `Apple Music API error (${res.status})`;
  try {
    const parsed = JSON.parse(text) as {
      errors?: Array<{ title?: string; detail?: string; status?: string }>;
    };
    body = parsed;
    const first = parsed.errors?.[0];
    if (first?.detail) message = first.detail;
    else if (first?.title) message = first.title;
  } catch {
    // keep text
  }
  return { message, body };
}
