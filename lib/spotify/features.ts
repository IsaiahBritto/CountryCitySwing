import { supabaseServer } from "@/lib/supabaseServer";
import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  FEATURE_DEFAULTS,
  needsFeatureLookup,
  selectTracksNeedingLookup,
  type TrackFeaturesRow,
} from "@/lib/spotify/featureFlags";
import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";

export {
  FEATURE_DEFAULTS,
  needsFeatureLookup,
  selectTracksNeedingLookup,
  type TrackFeaturesRow,
};
export type { ResolvedTrackFeatures };

const FREQBLOG_BASE = "https://api.freqblog.com";
const BULK_CHUNK = 50;

type FreqBlogLookup = {
  bpm?: number | null;
  bpm_alt?: number | null;
  energy?: number | null;
  danceability?: number | null;
  valence?: number | null;
  mood?: string | null;
  camelot?: string | null;
  itunes_track_id?: string | number | null;
  isrc?: string | null;
};

function freqBlogKey(): string {
  const key = process.env.FREQBLOG_API_KEY?.trim();
  if (!key) throw new Error("Missing FREQBLOG_API_KEY");
  return key;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function buildUpsertFromLookup(
  track: SpotifyTrack,
  lookup: FreqBlogLookup | null
): TrackFeaturesRow {
  const now = new Date().toISOString();
  const bpm = numOrNull(lookup?.bpm);
  const energy = numOrNull(lookup?.energy);
  const danceability = numOrNull(lookup?.danceability);
  const valence = numOrNull(lookup?.valence);
  const mood =
    typeof lookup?.mood === "string" && lookup.mood.trim()
      ? lookup.mood.trim().toLowerCase()
      : null;
  const camelot =
    typeof lookup?.camelot === "string" && lookup.camelot.trim()
      ? lookup.camelot.trim()
      : null;
  const bpmAlt = numOrNull(lookup?.bpm_alt);
  const itunes =
    lookup?.itunes_track_id != null ? String(lookup.itunes_track_id) : null;

  return {
    spotify_track_id: track.id,
    isrc: track.isrc ?? (typeof lookup?.isrc === "string" ? lookup.isrc : null),
    name: track.name,
    primary_artist: track.primaryArtist,
    itunes_track_id: itunes,
    bpm: bpm ?? FEATURE_DEFAULTS.bpm,
    true_bpm: bpm != null,
    bpm_alt: bpmAlt,
    energy: energy ?? FEATURE_DEFAULTS.energy,
    true_energy: energy != null,
    danceability: danceability ?? FEATURE_DEFAULTS.danceability,
    true_danceability: danceability != null,
    valence: valence ?? FEATURE_DEFAULTS.valence,
    true_valence: valence != null,
    mood: mood ?? FEATURE_DEFAULTS.mood,
    true_mood: mood != null,
    camelot: camelot ?? FEATURE_DEFAULTS.camelot,
    true_camelot: camelot != null,
    last_lookup_at: now,
    updated_at: now,
  };
}

function rowToResolved(row: TrackFeaturesRow): ResolvedTrackFeatures {
  return {
    spotifyTrackId: row.spotify_track_id,
    bpm: row.bpm,
    bpmAlt: row.bpm_alt,
    energy: row.energy,
    danceability: row.danceability,
    valence: row.valence,
    mood: row.mood,
    camelot: row.camelot,
    trueBpm: row.true_bpm,
    trueEnergy: row.true_energy,
    trueDanceability: row.true_danceability,
    trueValence: row.true_valence,
    trueMood: row.true_mood,
    trueCamelot: row.true_camelot,
  };
}

export async function loadCachedFeatures(
  trackIds: string[]
): Promise<Map<string, TrackFeaturesRow>> {
  const map = new Map<string, TrackFeaturesRow>();
  if (trackIds.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const { data, error } = await supabaseServer
      .from("spotify_track_features")
      .select("*")
      .in("spotify_track_id", chunk);

    if (error) {
      throw new Error(`Failed to load track features: ${error.message}`);
    }
    for (const row of data ?? []) {
      map.set(row.spotify_track_id, row as TrackFeaturesRow);
    }
  }
  return map;
}

async function upsertFeatureRows(rows: TrackFeaturesRow[]): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseServer
      .from("spotify_track_features")
      .upsert(chunk, { onConflict: "spotify_track_id" });
    if (error) {
      throw new Error(`Failed to upsert track features: ${error.message}`);
    }
  }
}

async function bulkLookupFreqBlog(
  tracks: SpotifyTrack[]
): Promise<Map<string, FreqBlogLookup | null>> {
  const key = freqBlogKey();
  const results = new Map<string, FreqBlogLookup | null>();

  for (let i = 0; i < tracks.length; i += BULK_CHUNK) {
    const chunk = tracks.slice(i, i + BULK_CHUNK);
    const body = chunk.map((t) => ({
      isrc: t.isrc ?? undefined,
      track: t.name,
      artist: t.primaryArtist,
    }));

    const res = await fetch(`${FREQBLOG_BASE}/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") || "2");
      await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
      i -= BULK_CHUNK;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FreqBlog /bulk failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as {
      results?: Array<{
        found?: boolean;
        result?: FreqBlogLookup | null;
        isrc?: string | null;
        track?: string | null;
        artist?: string | null;
      }>;
    };

    const apiResults = json.results ?? [];
    for (let j = 0; j < chunk.length; j++) {
      const track = chunk[j];
      const item = apiResults[j];
      if (item?.found && item.result) {
        results.set(track.id, item.result);
      } else {
        results.set(track.id, null);
      }
    }
  }

  return results;
}

export type ResolveFeaturesResult = {
  featuresById: Map<string, ResolvedTrackFeatures>;
  scanned: number;
  lookedUp: number;
  stillUnknown: number;
};

/**
 * Load cache, lookup gaps via FreqBlog, upsert, return resolved features for all tracks.
 */
export async function resolveTrackFeatures(
  tracks: SpotifyTrack[]
): Promise<ResolveFeaturesResult> {
  const unique = new Map<string, SpotifyTrack>();
  for (const t of tracks) unique.set(t.id, t);
  const list = [...unique.values()];

  const cached = await loadCachedFeatures(list.map((t) => t.id));
  const needing = selectTracksNeedingLookup(list, cached);

  let lookedUp = 0;
  if (needing.length > 0) {
    const lookups = await bulkLookupFreqBlog(needing);
    const upserts: TrackFeaturesRow[] = [];
    for (const track of needing) {
      const lookup = lookups.get(track.id) ?? null;
      const row = buildUpsertFromLookup(track, lookup);
      upserts.push(row);
      cached.set(track.id, row);
      lookedUp += 1;
    }
    await upsertFeatureRows(upserts);
  }

  // Ensure every track has a row (even if already complete in cache)
  const featuresById = new Map<string, ResolvedTrackFeatures>();
  let stillUnknown = 0;
  for (const track of list) {
    let row = cached.get(track.id);
    if (!row) {
      row = buildUpsertFromLookup(track, null);
      await upsertFeatureRows([row]);
      cached.set(track.id, row);
    }
    const resolved = rowToResolved(row);
    featuresById.set(track.id, resolved);
    if (
      !resolved.trueBpm ||
      !resolved.trueEnergy ||
      !resolved.trueDanceability ||
      !resolved.trueValence ||
      !resolved.trueMood ||
      !resolved.trueCamelot
    ) {
      stillUnknown += 1;
    }
  }

  return {
    featuresById,
    scanned: list.length,
    lookedUp,
    stillUnknown,
  };
}
