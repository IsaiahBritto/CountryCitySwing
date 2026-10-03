import type { MusicaeFetchResult } from "@/lib/musicae/client";
import type { MusicaeAnalysisResponse } from "@/lib/musicae/types";

function isAnalysisResponse(value: unknown): value is MusicaeAnalysisResponse {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return "rhythm" in o || "track" in o;
}

function unavailableIds(body: unknown): Set<string> {
  if (!body || typeof body !== "object") return new Set();
  const raw = (body as Record<string, unknown>).unavailable;
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter((x): x is string => typeof x === "string").map((x) => x.trim())
  );
}

function normalizeBatchEntry(entry: unknown): unknown {
  if (entry == null || typeof entry !== "object") return entry;
  if (isAnalysisResponse(entry)) return entry;
  const o = entry as Record<string, unknown>;
  if (isAnalysisResponse(o.audio_analysis)) return o.audio_analysis;
  return entry;
}

/** Log a safe preview of batch JSON (no API keys; truncated). */
export function logMusicaeBatchResponsePreview(
  ids: string[],
  body: unknown
): void {
  const bodyKeys =
    body && typeof body === "object" && !Array.isArray(body)
      ? Object.keys(body as Record<string, unknown>).join(",")
      : Array.isArray(body)
        ? `array[length=${body.length}]`
        : typeof body;

  let preview = "";
  try {
    preview = JSON.stringify(body).slice(0, 1500);
  } catch {
    preview = String(body).slice(0, 300);
  }

  console.info(
    "Musicae batch response:",
    JSON.stringify({
      requestedIds: ids,
      bodyKeys,
      preview,
    })
  );
}

/** Positional array aligned to request ids (Musicae batch convention). */
export function extractBatchAnalysisEntries(body: unknown): unknown[] | null {
  if (Array.isArray(body)) {
    return body;
  }
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  for (const key of [
    "audio_analysis",
    "audio_analyses",
    "analyses",
    "results",
    "data",
  ] as const) {
    const arr = o[key];
    if (Array.isArray(arr)) return arr;
  }
  return null;
}

function failAll(
  ids: string[],
  status: number,
  error: string,
  notFound: boolean
): MusicaeFetchResult[] {
  return ids.map((id) => ({
    ok: false as const,
    id,
    status,
    error,
    notFound,
  }));
}

/**
 * Map a batch HTTP response to per-id fetch results (same order as `ids`).
 */
export function parseMusicaeAudioAnalysisBatch(
  ids: string[],
  body: unknown,
  httpStatus: number,
  errorText = ""
): MusicaeFetchResult[] {
  if (ids.length === 0) return [];

  if (httpStatus === 404) {
    return failAll(ids, 404, "not_found", true);
  }

  if (httpStatus === 429 || httpStatus === 503) {
    const snippet = errorText.slice(0, 200) || `HTTP ${httpStatus}`;
    return failAll(ids, httpStatus, snippet, false);
  }

  if (httpStatus !== 200) {
    const snippet = errorText.slice(0, 200) || `HTTP ${httpStatus}`;
    return failAll(ids, httpStatus, snippet, false);
  }

  logMusicaeBatchResponsePreview(ids, body);

  const unavailable = unavailableIds(body);
  const entries = extractBatchAnalysisEntries(body);
  if (!entries) {
    console.warn(
      "Musicae batch: unexpected response shape (see Musicae batch response log above)"
    );
    return failAll(ids, 0, "unexpected_batch_shape", false);
  }

  return ids.map((id, index) => {
    const entry = normalizeBatchEntry(entries[index]);
    if (isAnalysisResponse(entry)) {
      return { ok: true as const, id, data: entry };
    }
    if (entry == null) {
      if (unavailable.has(id)) {
        return {
          ok: false as const,
          id,
          status: 503,
          error: "provider_unavailable",
          notFound: false,
        };
      }
      return {
        ok: false as const,
        id,
        status: 404,
        error: "not_found",
        notFound: true,
      };
    }
    return {
      ok: false as const,
      id,
      status: 0,
      error: "invalid_batch_entry",
      notFound: false,
    };
  });
}
