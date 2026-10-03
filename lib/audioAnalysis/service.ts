import { supabaseServer } from "@/lib/supabaseServer";
import {
  loadAnalysisByIsrcs,
  loadAnalysisBySpotifyIds,
} from "@/lib/audioAnalysis/cache";
import { dedupeAnalysisRowsByIsrc } from "@/lib/audioAnalysis/dedupe";
import {
  isRetryImmediatelyAnalysisError,
  needsAnalysisLookup,
  type FeatureRetryMode,
} from "@/lib/spotify/featureFlags";
import { fetchMusicaeAnalysisBatch, musicaeApiKey } from "@/lib/musicae/client";
import { normalizeIsrc, spotifyCacheIsrc } from "@/lib/musicae/isrc";
import {
  analysisFromMusicaeResponse,
  rowToTrackAudioAnalysis,
  toAnalysisRow,
} from "@/lib/musicae/normalize";
import type {
  MusicaeAnalysisStatus,
  TrackAudioAnalysisRow,
} from "@/lib/musicae/types";

/** Re-fetch not_found entries after this many days. */
const NOT_FOUND_RETRY_DAYS = 30;
/** Re-fetch generic temporary_error after this many hours. */
const TEMPORARY_ERROR_RETRY_HOURS = 1;

export type AnalysisTrackInput = {
  spotifyTrackId: string;
  isrc: string | null;
  name?: string;
  primaryArtist?: string;
};

export type PublicAnalysisStatus =
  | "complete"
  | "not_found"
  | "missing_isrc"
  | "temporary_error"
  | "pending"
  | "unavailable";

export type PublicAnalysisResult = {
  status: PublicAnalysisStatus;
  spotifyTrackId: string;
  isrc?: string | null;
  bpm?: number;
  halfTimeBpm?: number;
  doubleTimeBpm?: number;
  keyNote?: string;
  keyMode?: string;
  camelot?: string | null;
  openKey?: string;
  energy?: number;
  danceability?: number;
};

export type ResolveAudioAnalysisOptions = {
  allowExternalLookup?: boolean;
  retryMode?: FeatureRetryMode;
};

function temporaryErrorExpired(updatedAt: string): boolean {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return true;
  const ageMs = Date.now() - ts;
  return ageMs >= TEMPORARY_ERROR_RETRY_HOURS * 60 * 60 * 1000;
}

function notFoundExpired(updatedAt: string): boolean {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return true;
  const ageMs = Date.now() - ts;
  return ageMs >= NOT_FOUND_RETRY_DAYS * 24 * 60 * 60 * 1000;
}

function shouldSkipCachedRow(
  row: TrackAudioAnalysisRow,
  retryMode: FeatureRetryMode
): boolean {
  if (row.analysis_status === "complete") {
    return !needsAnalysisLookup(row, retryMode);
  }
  if (row.analysis_status === "missing_isrc") return true;
  if (row.analysis_status === "not_found") {
    return !notFoundExpired(row.updated_at);
  }
  if (row.analysis_status === "temporary_error") {
    if (isRetryImmediatelyAnalysisError(row.last_error)) return false;
    return !temporaryErrorExpired(row.updated_at);
  }
  return false;
}

function toPublicResult(
  track: AnalysisTrackInput,
  row: TrackAudioAnalysisRow | null
): PublicAnalysisResult {
  const analysis = row ? rowToTrackAudioAnalysis(row) : null;
  if (analysis) {
    return {
      status: "complete",
      spotifyTrackId: track.spotifyTrackId,
      isrc: analysis.isrc,
      bpm: analysis.bpm,
      halfTimeBpm: analysis.halfTimeBpm,
      doubleTimeBpm: analysis.doubleTimeBpm,
      keyNote: analysis.keyNote,
      keyMode: analysis.keyMode,
      camelot: analysis.camelot ?? null,
      openKey: analysis.openKey,
      energy: analysis.energy,
      danceability: analysis.danceability,
    };
  }

  if (row?.analysis_status === "not_found") {
    return {
      status: "not_found",
      spotifyTrackId: track.spotifyTrackId,
      isrc: normalizeIsrc(track.isrc),
    };
  }
  if (row?.analysis_status === "missing_isrc") {
    return {
      status: "missing_isrc",
      spotifyTrackId: track.spotifyTrackId,
      isrc: null,
    };
  }
  if (row?.analysis_status === "temporary_error") {
    return {
      status: "temporary_error",
      spotifyTrackId: track.spotifyTrackId,
      isrc: normalizeIsrc(track.isrc),
    };
  }

  return {
    status: "unavailable",
    spotifyTrackId: track.spotifyTrackId,
    isrc: normalizeIsrc(track.isrc),
  };
}

async function upsertAnalysisRows(rows: TrackAudioAnalysisRow[]): Promise<void> {
  const deduped = dedupeAnalysisRowsByIsrc(rows);
  if (deduped.length === 0) return;
  const chunkSize = 100;
  for (let i = 0; i < deduped.length; i += chunkSize) {
    const chunk = deduped.slice(i, i + chunkSize);
    const { error } = await supabaseServer
      .from("track_audio_analysis")
      .upsert(chunk, { onConflict: "isrc" });
    if (error) {
      throw new Error(`Failed to upsert track_audio_analysis: ${error.message}`);
    }
  }
}

export type ResolveAudioAnalysisResult = {
  byTrackId: Map<string, PublicAnalysisResult>;
  cacheHits: number;
  cacheMisses: number;
  musicaeLookups: number;
  analysisRowsByTrackId: Map<string, TrackAudioAnalysisRow | null>;
};

/**
 * Resolve audio analysis: ISRC cache → Musicae (Musicae-only; no FreqBlog).
 */
export async function resolveAudioAnalysis(
  tracks: AnalysisTrackInput[],
  options?: ResolveAudioAnalysisOptions
): Promise<ResolveAudioAnalysisResult> {
  const allowExternal = options?.allowExternalLookup !== false;
  const retryMode = options?.retryMode ?? "all_flags";

  const uniqueTracks = new Map<string, AnalysisTrackInput>();
  for (const t of tracks) {
    uniqueTracks.set(t.spotifyTrackId, t);
  }
  const list = [...uniqueTracks.values()];

  const isrcs = [
    ...new Set(
      list
        .map((t) => normalizeIsrc(t.isrc))
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const noIsrcIds = list
    .filter((t) => !normalizeIsrc(t.isrc))
    .map((t) => t.spotifyTrackId);

  const cachedByIsrc = await loadAnalysisByIsrcs(isrcs);
  const cachedBySpotifyId = await loadAnalysisBySpotifyIds(noIsrcIds);

  let cacheHits = 0;
  let cacheMisses = 0;

  type LookupJob = {
    track: AnalysisTrackInput;
    musicaeId: string;
    cacheIsrc: string | null;
  };

  const musicaeJobs: LookupJob[] = [];
  const analysisByTrackId = new Map<string, TrackAudioAnalysisRow | null>();

  for (const track of list) {
    const isrc = normalizeIsrc(track.isrc);
    let cached: TrackAudioAnalysisRow | undefined;
    if (isrc) {
      cached = cachedByIsrc.get(isrc);
    } else {
      cached = cachedBySpotifyId.get(track.spotifyTrackId);
    }

    if (cached && shouldSkipCachedRow(cached, retryMode)) {
      cacheHits += 1;
      analysisByTrackId.set(track.spotifyTrackId, cached);
      continue;
    }

    if (!allowExternal) {
      analysisByTrackId.set(track.spotifyTrackId, cached ?? null);
      continue;
    }

    if (
      cached?.analysis_status === "complete" &&
      !needsAnalysisLookup(cached, retryMode)
    ) {
      cacheHits += 1;
      analysisByTrackId.set(track.spotifyTrackId, cached);
      continue;
    }

    cacheMisses += 1;

    if (!isrc && !musicaeApiKey()) {
      analysisByTrackId.set(track.spotifyTrackId, cached ?? null);
      continue;
    }

    if (!isrc) {
      musicaeJobs.push({
        track,
        musicaeId: track.spotifyTrackId,
        cacheIsrc: null,
      });
      continue;
    }

    musicaeJobs.push({
      track,
      musicaeId: isrc,
      cacheIsrc: isrc,
    });
  }

  let musicaeLookups = 0;
  const upsertAnalysis: TrackAudioAnalysisRow[] = [];

  if (musicaeJobs.length > 0 && musicaeApiKey()) {
    const ids = musicaeJobs.map((j) => j.musicaeId);
    const fetchResults = await fetchMusicaeAnalysisBatch(ids);
    musicaeLookups = new Set(musicaeJobs.map((j) => j.musicaeId)).size;

    for (const job of musicaeJobs) {
      const result = fetchResults.get(job.musicaeId);

      if (!result) {
        continue;
      }

      if (result.ok) {
        const fallbackIsrc = job.cacheIsrc;
        const analysis = analysisFromMusicaeResponse(result.data, fallbackIsrc);
        const isrc =
          analysis?.isrc ??
          fallbackIsrc ??
          normalizeIsrc(result.data.track?.ids?.isrc);
        if (!isrc) {
          const synthetic = spotifyCacheIsrc(job.track.spotifyTrackId);
          const row = toAnalysisRow({
            analysis: null,
            status: "missing_isrc",
            rawResponse: result.data,
            lastError: "no_isrc_in_response",
            isrc: synthetic,
            spotifyTrackId: job.track.spotifyTrackId,
          });
          upsertAnalysis.push(row);
          analysisByTrackId.set(job.track.spotifyTrackId, row);
          continue;
        }

        if (!analysis) {
          const row = toAnalysisRow({
            analysis: null,
            status: "temporary_error",
            rawResponse: result.data,
            lastError: "empty_analysis_payload",
            isrc,
            spotifyTrackId: job.track.spotifyTrackId,
          });
          upsertAnalysis.push(row);
          analysisByTrackId.set(job.track.spotifyTrackId, row);
          continue;
        }

        const row = toAnalysisRow({
          analysis,
          status: "complete",
          rawResponse: result.data,
          lastError: null,
          isrc,
          spotifyTrackId: job.track.spotifyTrackId,
        });
        upsertAnalysis.push(row);
        analysisByTrackId.set(job.track.spotifyTrackId, row);
      } else if (result.notFound) {
        const isrc =
          job.cacheIsrc ??
          normalizeIsrc(job.track.isrc) ??
          spotifyCacheIsrc(job.track.spotifyTrackId);
        const row = toAnalysisRow({
          analysis: null,
          status: "not_found",
          rawResponse: null,
          lastError: "musicae_404",
          isrc,
          spotifyTrackId: job.track.spotifyTrackId,
        });
        upsertAnalysis.push(row);
        analysisByTrackId.set(job.track.spotifyTrackId, row);
      } else {
        const isrc =
          job.cacheIsrc ??
          normalizeIsrc(job.track.isrc) ??
          spotifyCacheIsrc(job.track.spotifyTrackId);
        const status: MusicaeAnalysisStatus = "temporary_error";
        const error = result.error.slice(0, 500);
        const skipPersist =
          error === "unexpected_batch_shape" ||
          error === "invalid_batch_entry";
        if (!skipPersist) {
          const row = toAnalysisRow({
            analysis: null,
            status,
            rawResponse: null,
            lastError: error,
            isrc,
            spotifyTrackId: job.track.spotifyTrackId,
          });
          upsertAnalysis.push(row);
          analysisByTrackId.set(job.track.spotifyTrackId, row);
        }
      }
    }

    await upsertAnalysisRows(upsertAnalysis);
  }

  const analysisRowsByTrackId = new Map<string, TrackAudioAnalysisRow | null>();
  const byTrackId = new Map<string, PublicAnalysisResult>();
  for (const track of list) {
    const row = analysisByTrackId.get(track.spotifyTrackId) ?? null;
    const isrc = normalizeIsrc(track.isrc);
    const cachedRow =
      row ??
      (isrc ? cachedByIsrc.get(isrc) : cachedBySpotifyId.get(track.spotifyTrackId)) ??
      null;
    analysisRowsByTrackId.set(track.spotifyTrackId, cachedRow);
    byTrackId.set(track.spotifyTrackId, toPublicResult(track, cachedRow));
  }

  return {
    byTrackId,
    cacheHits,
    cacheMisses,
    musicaeLookups,
    analysisRowsByTrackId,
  };
}

/** Response key for API maps: prefer ISRC, else spotify track id. */
export function analysisResponseKey(track: AnalysisTrackInput): string {
  return normalizeIsrc(track.isrc) ?? track.spotifyTrackId;
}

export async function resolveAudioAnalysisForApi(
  tracks: AnalysisTrackInput[],
  options?: ResolveAudioAnalysisOptions
): Promise<Record<string, PublicAnalysisResult>> {
  const result = await resolveAudioAnalysis(tracks, options);
  const out: Record<string, PublicAnalysisResult> = {};
  for (const track of tracks) {
    const key = analysisResponseKey(track);
    const value = result.byTrackId.get(track.spotifyTrackId);
    if (value) out[key] = value;
  }
  return out;
}
