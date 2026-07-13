import type { GenrePool } from "@/lib/spotify/playlistIds";
import type { SpotifyTrack } from "@/lib/spotify/client";

export type ResolvedTrackFeatures = {
  spotifyTrackId: string;
  bpm: number;
  bpmAlt: number | null;
  energy: number;
  danceability: number;
  valence: number;
  mood: string;
  camelot: string | null;
  trueBpm: boolean;
  trueEnergy: boolean;
  trueDanceability: boolean;
  trueValence: boolean;
  trueMood: boolean;
  trueCamelot: boolean;
};

export const TARGET_DURATION_MS = Math.round(5.5 * 60 * 60 * 1000);
export const SET_PATTERN: GenrePool[] = ["cs", "cs", "wcs", "wcs", "ld", "ld"];

export type CurateTrack = SpotifyTrack & {
  genre: GenrePool;
  features: ResolvedTrackFeatures;
};

export type CurateResult = {
  tracks: CurateTrack[];
  durationMs: number;
};

const BPM_SCALE = 40;
const PARTNER_WEIGHTS = { wE: 0.6, wB: 0.4, wD: 0.05 };
const LD_WEIGHTS = { wE: 0.8, wB: 0.2, wD: 0.05 };
const TOP_K = { cs: 10, wcs: 10, ld: 15 };

const SAD_MOODS = new Set(["sad", "melancholic"]);

export function effectiveBpm(features: ResolvedTrackFeatures): number {
  const bpm = features.bpm;
  const alt = features.bpmAlt;
  if (alt == null || !Number.isFinite(alt)) return bpm;
  // Prefer the value closer to a typical partner-dance band (~70–120)
  const bandCenter = 95;
  return Math.abs(alt - bandCenter) < Math.abs(bpm - bandCenter) ? alt : bpm;
}

function scoreTrack(
  track: CurateTrack,
  targetEnergy: number,
  targetBpm: number
): number {
  const weights = track.genre === "ld" ? LD_WEIGHTS : PARTNER_WEIGHTS;
  const bpm = effectiveBpm(track.features);
  return (
    weights.wE * Math.abs(track.features.energy - targetEnergy) +
    weights.wB * (Math.abs(bpm - targetBpm) / BPM_SCALE) -
    weights.wD * track.features.danceability
  );
}

function artistKey(name: string): string {
  return name.trim().toLowerCase();
}

function pickRandom<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Curate a Social playlist from genre pools.
 * Stops before starting a new set once elapsed >= target; always finishes an open set.
 */
export function curateSocialPlaylist(
  pools: Record<GenrePool, CurateTrack[]>,
  options?: {
    targetDurationMs?: number;
    rng?: () => number;
  }
): CurateResult {
  const targetDurationMs = options?.targetDurationMs ?? TARGET_DURATION_MS;
  const rng = options?.rng ?? Math.random;

  const remaining: Record<GenrePool, CurateTrack[]> = {
    cs: [...pools.cs],
    wcs: [...pools.wcs],
    ld: [...pools.ld],
  };

  const playlist: CurateTrack[] = [];
  let elapsed = 0;
  let phase = rng() * Math.PI * 2;
  let targetEnergy = 0.45 + 0.25 * Math.sin(phase);
  let targetBpm = 85 + 20 * Math.sin(phase);

  const takeFromPool = (genre: GenrePool, previousArtist: string | null): CurateTrack => {
    const pool = remaining[genre];
    if (pool.length === 0) {
      throw new Error(
        `Pool exhausted for ${genre.toUpperCase()} mid-set. Add more songs to the master playlist.`
      );
    }

    const scored = pool
      .map((track, index) => ({
        track,
        index,
        score: scoreTrack(track, targetEnergy, targetBpm),
      }))
      .sort((a, b) => a.score - b.score);

    const k = Math.min(TOP_K[genre], scored.length);
    let window = scored.slice(0, k);

    if (previousArtist) {
      const prev = artistKey(previousArtist);
      const differentArtist = window.filter(
        (c) => artistKey(c.track.primaryArtist) !== prev
      );
      if (differentArtist.length > 0) {
        window = differentArtist;
      } else {
        const wider = scored.filter(
          (c) => artistKey(c.track.primaryArtist) !== prev
        );
        if (wider.length > 0) {
          window = wider.slice(0, Math.min(k * 2, wider.length));
        } else {
          throw new Error(
            `Could not avoid same artist back-to-back for ${genre.toUpperCase()} (${previousArtist}).`
          );
        }
      }
    }

    // Soft mood bias: avoid stacking sad/melancholic when alternatives exist
    const last = playlist[playlist.length - 1];
    if (last && SAD_MOODS.has(last.features.mood.toLowerCase())) {
      const nonSad = window.filter(
        (c) => !SAD_MOODS.has(c.track.features.mood.toLowerCase())
      );
      if (nonSad.length > 0) window = nonSad;
    }

    const chosen = pickRandom(window, rng).track;
    const idx = remaining[genre].findIndex((t) => t.id === chosen.id);
    if (idx >= 0) remaining[genre].splice(idx, 1);
    return chosen;
  };

  while (elapsed < targetDurationMs) {
    let previousArtist: string | null =
      playlist.length > 0 ? playlist[playlist.length - 1].primaryArtist : null;

    for (const genre of SET_PATTERN) {
      const track = takeFromPool(genre, previousArtist);
      playlist.push(track);
      elapsed += track.durationMs;
      previousArtist = track.primaryArtist;

      phase += 0.35;
      const waveEnergy = 0.45 + 0.25 * Math.sin(phase);
      const waveBpm = 85 + 20 * Math.sin(phase);
      targetEnergy = waveEnergy * 0.7 + track.features.energy * 0.3;
      targetBpm = waveBpm * 0.7 + effectiveBpm(track.features) * 0.3;
    }
  }

  return { tracks: playlist, durationMs: elapsed };
}
