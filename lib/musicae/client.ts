import { parseMusicaeAudioAnalysisBatch } from "@/lib/musicae/batchParse";
import type { MusicaeAnalysisResponse } from "@/lib/musicae/types";

const MUSICAE_HOST = "dj-track-audio-analysis-api.p.rapidapi.com";
const MUSICAE_BASE = `https://${MUSICAE_HOST}`;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BATCH_SIZE = 5;
const MAX_429_RETRIES = 2;

export type MusicaeFetchResult =
  | { ok: true; id: string; data: MusicaeAnalysisResponse }
  | { ok: false; id: string; status: number; error: string; notFound: boolean };

export function musicaeApiKey(): string | null {
  const key = process.env.MUSICAE_RAPIDAPI_KEY?.trim();
  return key || null;
}

export function logMusicaeRequest(input: {
  endpoint: string;
  batchSize: number;
  status: number;
  durationMs: number;
  cacheHits?: number;
  cacheMisses?: number;
  notFoundCount?: number;
  rateLimited?: boolean;
  errorMessage?: string;
}): void {
  console.info(
    "Musicae API:",
    JSON.stringify({
      provider: "musicae",
      endpoint: input.endpoint,
      batchSize: input.batchSize,
      status: input.status,
      durationMs: input.durationMs,
      cacheHits: input.cacheHits ?? null,
      cacheMisses: input.cacheMisses ?? null,
      notFoundCount: input.notFoundCount ?? null,
      rateLimited: input.rateLimited ?? false,
      errorMessage: input.errorMessage ?? null,
    })
  );
}

function parseRetryAfterSec(res: Response): number {
  const raw = res.headers.get("retry-after");
  if (!raw) return 2;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function buildUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`${MUSICAE_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

function logEndpoint(path: string, query?: Record<string, string>): string {
  if (query?.ids) {
    return `${path}?ids=${query.ids}`;
  }
  return path;
}

type MusicaeHttpOutcome =
  | { kind: "ok"; status: number; json: unknown; durationMs: number }
  | { kind: "error"; status: number; text: string; durationMs: number; res?: Response };

async function musicaeGetOnce(
  path: string,
  key: string,
  query?: Record<string, string>
): Promise<MusicaeHttpOutcome> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(path, query), {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": MUSICAE_HOST,
      },
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    if (res.ok) {
      const json = (await res.json()) as unknown;
      return { kind: "ok", status: res.status, json, durationMs };
    }
    const text = await res.text().catch(() => "");
    return { kind: "error", status: res.status, text, durationMs, res };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", status: 0, text: message, durationMs };
  } finally {
    clearTimeout(timer);
  }
}

async function musicaeGetWith429Retry(
  path: string,
  key: string,
  batchSize: number,
  query?: Record<string, string>,
  attempt = 0
): Promise<MusicaeHttpOutcome> {
  const endpoint = logEndpoint(path, query);
  const outcome = await musicaeGetOnce(path, key, query);

  if (
    outcome.kind === "error" &&
    outcome.status === 429 &&
    attempt < MAX_429_RETRIES &&
    outcome.res
  ) {
    logMusicaeRequest({
      endpoint,
      batchSize,
      status: 429,
      durationMs: outcome.durationMs,
      rateLimited: true,
    });
    await new Promise((r) =>
      setTimeout(r, parseRetryAfterSec(outcome.res!) * 1000)
    );
    return musicaeGetWith429Retry(path, key, batchSize, query, attempt + 1);
  }

  return outcome;
}

async function fetchOneAnalysis(id: string, key: string): Promise<MusicaeFetchResult> {
  const path = `/v2/audio-analysis/${encodeURIComponent(id)}`;
  const outcome = await musicaeGetWith429Retry(path, key, 1);

  if (outcome.kind === "ok") {
    logMusicaeRequest({
      endpoint: path,
      batchSize: 1,
      status: 200,
      durationMs: outcome.durationMs,
    });
    return {
      ok: true,
      id,
      data: outcome.json as MusicaeAnalysisResponse,
    };
  }

  if (outcome.status === 404) {
    logMusicaeRequest({
      endpoint: path,
      batchSize: 1,
      status: 404,
      durationMs: outcome.durationMs,
      notFoundCount: 1,
    });
    return {
      ok: false,
      id,
      status: 404,
      error: "not_found",
      notFound: true,
    };
  }

  const snippet = outcome.text.slice(0, 200);
  logMusicaeRequest({
    endpoint: path,
    batchSize: 1,
    status: outcome.status,
    durationMs: outcome.durationMs,
    errorMessage: snippet || undefined,
    rateLimited: outcome.status === 429,
  });
  return {
    ok: false,
    id,
    status: outcome.status,
    error: snippet || `HTTP ${outcome.status}`,
    notFound: false,
  };
}

async function fetchSeveralAnalysis(
  ids: string[],
  key: string
): Promise<MusicaeFetchResult[]> {
  if (ids.length < 2 || ids.length > MAX_BATCH_SIZE) {
    throw new Error(`fetchSeveralAnalysis expects 2–${MAX_BATCH_SIZE} ids`);
  }

  const path = "/v2/audio-analysis";
  const idsParam = ids.join(",");
  const endpoint = `${path}?ids=${idsParam}`;
  const outcome = await musicaeGetWith429Retry(
    path,
    key,
    ids.length,
    { ids: idsParam }
  );

  if (outcome.kind === "ok") {
    const parsed = parseMusicaeAudioAnalysisBatch(
      ids,
      outcome.json,
      200
    );
    const notFoundCount = parsed.filter((r) => !r.ok && r.notFound).length;
    logMusicaeRequest({
      endpoint,
      batchSize: ids.length,
      status: 200,
      durationMs: outcome.durationMs,
      notFoundCount: notFoundCount > 0 ? notFoundCount : undefined,
    });
    return parsed;
  }

  const snippet = outcome.text.slice(0, 200);
  logMusicaeRequest({
    endpoint,
    batchSize: ids.length,
    status: outcome.status,
    durationMs: outcome.durationMs,
    errorMessage: snippet || undefined,
    rateLimited: outcome.status === 429,
  });

  return parseMusicaeAudioAnalysisBatch(
    ids,
    null,
    outcome.status,
    snippet
  );
}

/**
 * Fetch Musicae analysis for up to many IDs (ISRC or Spotify track ID).
 * Uses GET /v2/audio-analysis?ids= for 2–5 IDs per HTTP request; single-ID path otherwise.
 */
export async function fetchMusicaeAnalysisBatch(
  ids: string[]
): Promise<Map<string, MusicaeFetchResult>> {
  const key = musicaeApiKey();
  const results = new Map<string, MusicaeFetchResult>();
  if (ids.length === 0) return results;

  if (!key) {
    for (const id of ids) {
      results.set(id, {
        ok: false,
        id,
        status: 401,
        error: "Missing MUSICAE_RAPIDAPI_KEY",
        notFound: false,
      });
    }
    return results;
  }

  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += MAX_BATCH_SIZE) {
    const chunk = unique.slice(i, i + MAX_BATCH_SIZE);
    const chunkResults =
      chunk.length === 1
        ? [await fetchOneAnalysis(chunk[0]!, key)]
        : await fetchSeveralAnalysis(chunk, key);
    for (const r of chunkResults) {
      results.set(r.id, r);
    }
  }

  return results;
}

export { MAX_BATCH_SIZE };
