import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CurateTrack } from "@/lib/spotify/curate";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { emptyGenrePools } from "@/lib/spotify/playlistIds";
import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";

vi.mock("@/lib/appleMusic/client", () => ({
  fetchCatalogSongsByIsrc: vi.fn(),
}));

vi.mock("@/lib/audioAnalysis/cache", () => ({
  loadCachedAnalysisForTracks: vi.fn(),
}));

import { fetchCatalogSongsByIsrc } from "@/lib/appleMusic/client";
import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { mapCuratedTracksToApple } from "@/lib/appleMusic/mapCuratedTracksToApple";

function features(spotifyTrackId: string): ResolvedTrackFeatures {
  return {
    spotifyTrackId,
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
  };
}

function track(
  id: string,
  genre: GenrePool,
  isrc: string | null
): CurateTrack {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: id,
    durationMs: 180_000,
    primaryArtist: `Artist ${id}`,
    isrc,
    genre,
    features: features(id),
  };
}

describe("mapCuratedTracksToApple", () => {
  beforeEach(() => {
    vi.mocked(fetchCatalogSongsByIsrc).mockReset();
    vi.mocked(loadCachedAnalysisForTracks).mockReset();
  });

  it("maps curated rows to Apple catalog ids by ISRC", async () => {
    const pools = emptyGenrePools<CurateTrack[]>();
    pools.cs = [
      track("a", "cs", "USAAA1111111"),
      track("b", "cs", "USBBB2222222"),
    ];
    vi.mocked(loadCachedAnalysisForTracks).mockResolvedValue(new Map());
    vi.mocked(fetchCatalogSongsByIsrc).mockResolvedValue(
      new Map([
        [
          "USAAA1111111",
          {
            catalogId: "apple-a",
            isrc: "USAAA1111111",
            provider: "apple_music",
            title: "a",
            artist: "Artist a",
            durationMs: 180_000,
            uri: "apple:a",
          },
        ],
        [
          "USBBB2222222",
          {
            catalogId: "apple-b",
            isrc: "USBBB2222222",
            provider: "apple_music",
            title: "b",
            artist: "Artist b",
            durationMs: 180_000,
            uri: "apple:b",
          },
        ],
      ])
    );

    const result = await mapCuratedTracksToApple({
      curatedTracks: [pools.cs[0], pools.cs[1]],
      pools,
      developerToken: "dev",
      storefront: "us",
    });

    expect(result.appleCatalogSongIds).toEqual(["apple-a", "apple-b"]);
    expect(result.replacedForApple).toBe(0);
  });

  it("backfills a slot when the curated row has no Apple match", async () => {
    const pools = emptyGenrePools<CurateTrack[]>();
    pools.wcs = [
      track("missing", "wcs", "USMISSING000"),
      track("replacement", "wcs", "USREPL333333"),
    ];
    vi.mocked(loadCachedAnalysisForTracks).mockResolvedValue(new Map());
    vi.mocked(fetchCatalogSongsByIsrc).mockResolvedValue(
      new Map([
        [
          "USREPL333333",
          {
            catalogId: "apple-repl",
            isrc: "USREPL333333",
            provider: "apple_music",
            title: "replacement",
            artist: "Artist replacement",
            durationMs: 180_000,
            uri: "apple:repl",
          },
        ],
      ])
    );

    const result = await mapCuratedTracksToApple({
      curatedTracks: [pools.wcs[0]],
      pools,
      developerToken: "dev",
      storefront: "us",
    });

    expect(result.appleCatalogSongIds).toEqual(["apple-repl"]);
    expect(result.replacedForApple).toBe(1);
  });

  it("throws when no Apple-eligible track remains in the genre pool", async () => {
    const pools = emptyGenrePools<CurateTrack[]>();
    pools.ld = [track("only", "ld", "USNONE444444")];
    vi.mocked(loadCachedAnalysisForTracks).mockResolvedValue(new Map());
    vi.mocked(fetchCatalogSongsByIsrc).mockResolvedValue(new Map());

    await expect(
      mapCuratedTracksToApple({
        curatedTracks: [pools.ld[0]],
        pools,
        developerToken: "dev",
        storefront: "us",
      })
    ).rejects.toThrow(/Not enough Apple Music catalog tracks for LD/i);
  });
});
