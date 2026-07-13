import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";
import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  curateSocialPlaylist,
  effectiveBpm,
  TARGET_DURATION_MS,
  type CurateTrack,
} from "@/lib/spotify/curate";
import {
  needsBpmOrEnergyLookup,
  needsFeatureLookup,
  selectTracksNeedingLookup,
  type TrackFeaturesRow,
} from "@/lib/spotify/featureFlags";
import { parseSpotifyPlaylistId } from "@/lib/spotify/playlistIds";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { describe, expect, it } from "vitest";

function features(
  partial: Partial<ResolvedTrackFeatures> & { spotifyTrackId: string }
): ResolvedTrackFeatures {
  return {
    bpm: 100,
    bpmAlt: null,
    energy: 0.5,
    danceability: 0.7,
    valence: 0.5,
    mood: "happy",
    camelot: "8A",
    trueBpm: true,
    trueEnergy: true,
    trueDanceability: true,
    trueValence: true,
    trueMood: true,
    trueCamelot: true,
    ...partial,
  };
}

function makeTrack(
  id: string,
  genre: GenrePool,
  opts?: {
    artist?: string;
    durationMs?: number;
    energy?: number;
    bpm?: number;
    mood?: string;
  }
): CurateTrack {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Song ${id}`,
    durationMs: opts?.durationMs ?? 180_000,
    primaryArtist: opts?.artist ?? `Artist ${id}`,
    isrc: null,
    genre,
    features: features({
      spotifyTrackId: id,
      energy: opts?.energy ?? 0.5,
      bpm: opts?.bpm ?? 100,
      mood: opts?.mood ?? "happy",
    }),
  };
}

function fillPool(genre: GenrePool, count: number, artistPrefix = "A"): CurateTrack[] {
  return Array.from({ length: count }, (_, i) =>
    makeTrack(`${genre}-${i}`, genre, {
      artist: `${artistPrefix}-${genre}-${i}`,
      energy: 0.3 + (i % 10) * 0.05,
      bpm: 80 + (i % 20),
    })
  );
}

describe("parseSpotifyPlaylistId", () => {
  it("parses open.spotify.com playlist URLs", () => {
    expect(
      parseSpotifyPlaylistId(
        "https://open.spotify.com/playlist/4FtXSbbhvWrGm9CH0kkxzn?si=abc"
      )
    ).toBe("4FtXSbbhvWrGm9CH0kkxzn");
  });

  it("accepts a raw 22-char id", () => {
    expect(parseSpotifyPlaylistId("4FtXSbbhvWrGm9CH0kkxzn")).toBe(
      "4FtXSbbhvWrGm9CH0kkxzn"
    );
  });

  it("returns null for invalid input", () => {
    expect(parseSpotifyPlaylistId("not-a-playlist")).toBeNull();
  });
});

describe("needsFeatureLookup / selectTracksNeedingLookup", () => {
  const baseRow = (overrides: Partial<TrackFeaturesRow> = {}): TrackFeaturesRow => ({
    spotify_track_id: "t1",
    isrc: null,
    name: "Song",
    primary_artist: "Artist",
    itunes_track_id: null,
    bpm: 100,
    true_bpm: true,
    bpm_alt: null,
    energy: 0.5,
    true_energy: true,
    danceability: 0.5,
    true_danceability: true,
    valence: 0.5,
    true_valence: true,
    mood: "neutral",
    true_mood: true,
    camelot: "8A",
    true_camelot: true,
    last_lookup_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  it("needs lookup when row is missing", () => {
    expect(needsFeatureLookup(null)).toBe(true);
  });

  it("skips when all true_* flags are true", () => {
    expect(needsFeatureLookup(baseRow())).toBe(false);
  });

  it("retries when any true_* flag is false", () => {
    expect(needsFeatureLookup(baseRow({ true_energy: false }))).toBe(true);
    expect(needsFeatureLookup(baseRow({ true_camelot: false }))).toBe(true);
  });

  it("selects only tracks needing lookup", () => {
    const tracks: SpotifyTrack[] = [
      {
        id: "a",
        uri: "spotify:track:a",
        name: "A",
        durationMs: 1000,
        primaryArtist: "X",
        isrc: null,
      },
      {
        id: "b",
        uri: "spotify:track:b",
        name: "B",
        durationMs: 1000,
        primaryArtist: "Y",
        isrc: null,
      },
    ];
    const cached = new Map<string, TrackFeaturesRow>([
      ["a", baseRow({ spotify_track_id: "a" })],
      ["b", baseRow({ spotify_track_id: "b", true_bpm: false })],
    ]);
    const needing = selectTracksNeedingLookup(tracks, cached);
    expect(needing.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("needsBpmOrEnergyLookup", () => {
  const baseRow = (overrides: Partial<TrackFeaturesRow> = {}): TrackFeaturesRow => ({
    spotify_track_id: "t1",
    isrc: null,
    name: "Song",
    primary_artist: "Artist",
    itunes_track_id: null,
    bpm: 100,
    true_bpm: true,
    bpm_alt: null,
    energy: 0.5,
    true_energy: true,
    danceability: 0.5,
    true_danceability: true,
    valence: 0.5,
    true_valence: true,
    mood: "neutral",
    true_mood: true,
    camelot: "8A",
    true_camelot: true,
    last_lookup_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  it("needs lookup when row is missing", () => {
    expect(needsBpmOrEnergyLookup(null)).toBe(true);
  });

  it("skips when true_bpm and true_energy are true", () => {
    expect(needsBpmOrEnergyLookup(baseRow())).toBe(false);
  });

  it("retries when energy is missing", () => {
    expect(needsBpmOrEnergyLookup(baseRow({ true_energy: false }))).toBe(true);
  });

  it("does not retry when only camelot is false", () => {
    expect(needsBpmOrEnergyLookup(baseRow({ true_camelot: false }))).toBe(false);
  });

  it("selects bpm/energy gaps only in bpm_energy mode", () => {
    const tracks: SpotifyTrack[] = [
      {
        id: "a",
        uri: "spotify:track:a",
        name: "A",
        durationMs: 1000,
        primaryArtist: "X",
        isrc: null,
      },
      {
        id: "b",
        uri: "spotify:track:b",
        name: "B",
        durationMs: 1000,
        primaryArtist: "Y",
        isrc: null,
      },
      {
        id: "c",
        uri: "spotify:track:c",
        name: "C",
        durationMs: 1000,
        primaryArtist: "Z",
        isrc: null,
      },
    ];
    const cached = new Map<string, TrackFeaturesRow>([
      ["a", baseRow({ spotify_track_id: "a" })],
      ["b", baseRow({ spotify_track_id: "b", true_camelot: false })],
      ["c", baseRow({ spotify_track_id: "c", true_bpm: false })],
    ]);
    expect(
      selectTracksNeedingLookup(tracks, cached, "bpm_energy").map((t) => t.id)
    ).toEqual(["c"]);
    // Sync still uses all_flags and would include camelot-only gaps
    expect(
      selectTracksNeedingLookup(tracks, cached, "all_flags").map((t) => t.id)
    ).toEqual(["b", "c"]);
  });
});

describe("effectiveBpm", () => {
  it("uses bpm_alt when closer to partner-dance band", () => {
    expect(
      effectiveBpm(
        features({ spotifyTrackId: "x", bpm: 85, bpmAlt: 170 })
      )
    ).toBe(85);
    expect(
      effectiveBpm(
        features({ spotifyTrackId: "y", bpm: 170, bpmAlt: 85 })
      )
    ).toBe(85);
  });
});

describe("curateSocialPlaylist", () => {
  const rng = () => 0.1;

  it("finishes a full set even after crossing 5.5h mid-set", () => {
    // Each song ~1 hour so first song of a set crosses target quickly
    const long = (genre: GenrePool, n: number) =>
      Array.from({ length: n }, (_, i) =>
        makeTrack(`${genre}-long-${i}`, genre, {
          artist: `L-${genre}-${i}`,
          durationMs: 60 * 60 * 1000,
          energy: 0.5,
        })
      );

    const result = curateSocialPlaylist(
      {
        cs: long("cs", 20),
        wcs: long("wcs", 20),
        ld: long("ld", 20),
      },
      { targetDurationMs: TARGET_DURATION_MS, rng }
    );

    expect(result.tracks.length % 6).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(TARGET_DURATION_MS);
    // Pattern within each set
    for (let i = 0; i < result.tracks.length; i += 6) {
      expect(result.tracks.slice(i, i + 6).map((t) => t.genre)).toEqual([
        "cs",
        "cs",
        "wcs",
        "wcs",
        "ld",
        "ld",
      ]);
    }
  });

  it("does not repeat track ids", () => {
    const result = curateSocialPlaylist(
      {
        cs: fillPool("cs", 40),
        wcs: fillPool("wcs", 40),
        ld: fillPool("ld", 40),
      },
      { targetDurationMs: 30 * 60 * 1000, rng }
    );
    const ids = result.tracks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("avoids same artist back-to-back when alternatives exist", () => {
    const result = curateSocialPlaylist(
      {
        cs: fillPool("cs", 30, "CS"),
        wcs: fillPool("wcs", 30, "WCS"),
        ld: fillPool("ld", 30, "LD"),
      },
      { targetDurationMs: 45 * 60 * 1000, rng }
    );
    for (let i = 1; i < result.tracks.length; i++) {
      expect(result.tracks[i].primaryArtist.toLowerCase()).not.toBe(
        result.tracks[i - 1].primaryArtist.toLowerCase()
      );
    }
  });

  it("throws when a genre pool is exhausted mid-set", () => {
    expect(() =>
      curateSocialPlaylist(
        {
          cs: fillPool("cs", 2),
          wcs: fillPool("wcs", 2),
          ld: [],
        },
        { targetDurationMs: TARGET_DURATION_MS, rng }
      )
    ).toThrow(/Pool exhausted/i);
  });
});
