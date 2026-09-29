import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";
import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  normalizeEnergyTiers,
  trackMatchesBpm,
  trackMatchesEnergy,
  trackMatchesSlot,
  type CompPoolTrack,
} from "@/lib/spotify/compCriteria";
import {
  countRequiredTracks,
  curateCompPlaylist,
} from "@/lib/spotify/curateComp";
import type { CompPlaylistRoundConfig } from "@/lib/spotify/compPlaylistTypes";
import { validateCompPlaylistConfig } from "@/lib/spotify/compPlaylistValidate";
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
  opts?: { artist?: string; bpm?: number; energy?: number }
): CompPoolTrack {
  const track: SpotifyTrack = {
    id,
    uri: `spotify:track:${id}`,
    name: `Song ${id}`,
    durationMs: 180_000,
    primaryArtist: opts?.artist ?? `Artist ${id}`,
    isrc: null,
  };
  return {
    ...track,
    features: features({
      spotifyTrackId: id,
      bpm: opts?.bpm ?? 100,
      energy: opts?.energy ?? 0.5,
    }),
  };
}

describe("compCriteria", () => {
  it("matches inclusive BPM boundaries", () => {
    const low = features({ spotifyTrackId: "a", bpm: 80 });
    const midLow = features({ spotifyTrackId: "b", bpm: 81 });
    const midHigh = features({ spotifyTrackId: "c", bpm: 119 });
    const high = features({ spotifyTrackId: "d", bpm: 120 });

    expect(trackMatchesBpm(low, "low")).toBe(true);
    expect(trackMatchesBpm(midLow, "mid")).toBe(true);
    expect(trackMatchesBpm(midHigh, "mid")).toBe(true);
    expect(trackMatchesBpm(high, "high")).toBe(true);
    expect(trackMatchesBpm(low, "mid")).toBe(false);
  });

  it("rejects default BPM when Musicae BPM is unknown", () => {
    const fakeMid = features({
      spotifyTrackId: "a",
      bpm: 100,
      trueBpm: false,
    });
    expect(trackMatchesBpm(fakeMid, "mid")).toBe(false);
    expect(trackMatchesBpm(fakeMid, "low")).toBe(false);
    expect(trackMatchesSlot(fakeMid, { bpm: "mid", energy: [] })).toBe(false);
  });

  it("allows any energy when energy tiers are empty without trueEnergy", () => {
    const track = features({
      spotifyTrackId: "a",
      energy: 0.9,
      trueEnergy: false,
    });
    expect(trackMatchesEnergy(track, [])).toBe(true);
  });

  it("rejects energy-filtered slots when Musicae energy is unknown", () => {
    const track = features({
      spotifyTrackId: "a",
      bpm: 125,
      energy: 0.2,
      trueEnergy: false,
    });
    expect(trackMatchesEnergy(track, ["low"])).toBe(false);
    expect(
      trackMatchesSlot(track, { bpm: "high", energy: ["low"] })
    ).toBe(false);
  });

  it("uses base BPM only, not half/double-time alternates", () => {
    const track = features({
      spotifyTrackId: "a",
      bpm: 128,
      bpmAlt: 64,
    });
    expect(trackMatchesBpm(track, "high")).toBe(true);
    expect(trackMatchesBpm(track, "low")).toBe(false);
    expect(trackMatchesBpm(track, "mid")).toBe(false);
  });

  it("matches slow_and_fast for low or high BPM bands only", () => {
    const slow = features({ spotifyTrackId: "a", bpm: 70, energy: 0.2 });
    const fast = features({ spotifyTrackId: "b", bpm: 130 });
    const mid = features({ spotifyTrackId: "c", bpm: 100 });
    const noBpm = features({ spotifyTrackId: "d", bpm: 70, trueBpm: false });

    expect(trackMatchesBpm(slow, "slow_and_fast")).toBe(true);
    expect(trackMatchesBpm(fast, "slow_and_fast")).toBe(true);
    expect(trackMatchesBpm(mid, "slow_and_fast")).toBe(false);
    expect(trackMatchesBpm(noBpm, "slow_and_fast")).toBe(false);
    expect(
      trackMatchesSlot(slow, { bpm: "slow_and_fast", energy: ["low"] })
    ).toBe(true);
  });

  it("treats empty or all-three energy tiers as any energy", () => {
    const track = features({ spotifyTrackId: "a", energy: 0.9 });
    expect(normalizeEnergyTiers([])).toBeNull();
    expect(normalizeEnergyTiers(["low", "mid", "high"])).toBeNull();
    expect(trackMatchesEnergy(track, [])).toBe(true);
    expect(trackMatchesEnergy(track, ["low", "mid", "high"])).toBe(true);
  });

  it("filters energy with one or two selected tiers", () => {
    const low = features({ spotifyTrackId: "a", energy: 0.2 });
    const mid = features({ spotifyTrackId: "b", energy: 0.5 });
    const high = features({ spotifyTrackId: "c", energy: 0.8 });

    expect(trackMatchesEnergy(low, ["low"])).toBe(true);
    expect(trackMatchesEnergy(mid, ["low"])).toBe(false);
    expect(trackMatchesEnergy(high, ["low", "mid"])).toBe(false);
    expect(trackMatchesEnergy(mid, ["low", "mid"])).toBe(true);
  });

  it("matches slot with BPM required and optional energy", () => {
    const track = features({ spotifyTrackId: "a", bpm: 125, energy: 0.2 });
    expect(
      trackMatchesSlot(track, { bpm: "high", energy: ["low"] })
    ).toBe(true);
    expect(
      trackMatchesSlot(track, { bpm: "high", energy: ["high"] })
    ).toBe(false);
    expect(
      trackMatchesSlot(track, { bpm: "high", energy: [] })
    ).toBe(true);
  });
});

describe("curateCompPlaylist", () => {
  const round: CompPlaylistRoundConfig = {
    roundType: "prelims",
    enabled: true,
    heatCount: 2,
    songsPerHeat: 2,
    songStructure: [
      { bpm: "low", energy: [] },
      { bpm: "high", energy: ["low"] },
    ],
  };

  it("orders tracks by round, heat, and song", () => {
    const pool = [
      makeTrack("l1", { bpm: 70, energy: 0.5, artist: "A1" }),
      makeTrack("l2", { bpm: 75, energy: 0.5, artist: "A2" }),
      makeTrack("h1", { bpm: 130, energy: 0.2, artist: "B1" }),
      makeTrack("h2", { bpm: 140, energy: 0.3, artist: "B2" }),
      makeTrack("l3", { bpm: 68, energy: 0.4, artist: "A3" }),
      makeTrack("h3", { bpm: 125, energy: 0.1, artist: "B3" }),
      makeTrack("l4", { bpm: 72, energy: 0.6, artist: "A4" }),
      makeTrack("h4", { bpm: 150, energy: 0.2, artist: "B4" }),
    ];

    const result = curateCompPlaylist(pool, [round], { rng: () => 0 });
    expect(result.tracks).toHaveLength(4);
    expect(result.tracks.map((t) => t.id)).toEqual(["l1", "h1", "l2", "h2"]);
    expect(result.tracks.every((t) => t.roundType === "prelims")).toBe(true);
    expect(result.tracks[0].heatNumber).toBe(1);
    expect(result.tracks[2].heatNumber).toBe(2);
    expect(new Set(result.tracks.map((t) => t.id)).size).toBe(4);
  });

  it("picks randomly among qualifying tracks", () => {
    const singleSlotRound: CompPlaylistRoundConfig = {
      roundType: "prelims",
      enabled: true,
      heatCount: 1,
      songsPerHeat: 1,
      songStructure: [{ bpm: "low", energy: [] }],
    };
    const pool = [
      makeTrack("a", { bpm: 70 }),
      makeTrack("b", { bpm: 75 }),
    ];
    const first = curateCompPlaylist(pool, [singleSlotRound], { rng: () => 0 });
    const second = curateCompPlaylist(pool, [singleSlotRound], {
      rng: () => 0.99,
    });
    expect(first.tracks[0].id).toBe("a");
    expect(second.tracks[0].id).toBe("b");
  });

  it("prefers a different artist when prior slot used same artist", () => {
    const twoLowSlots: CompPlaylistRoundConfig = {
      roundType: "prelims",
      enabled: true,
      heatCount: 1,
      songsPerHeat: 2,
      songStructure: [
        { bpm: "low", energy: [] },
        { bpm: "low", energy: [] },
      ],
    };
    const pool = [
      makeTrack("a1", { bpm: 70, artist: "Repeat" }),
      makeTrack("a2", { bpm: 71, artist: "Repeat" }),
      makeTrack("b1", { bpm: 72, artist: "Other" }),
    ];
    const result = curateCompPlaylist(pool, [twoLowSlots], { rng: () => 0 });
    expect(result.tracks.map((t) => t.id)).toEqual(["a1", "b1"]);
  });

  it("throws when no track matches slot criteria", () => {
    const pool = [makeTrack("only-mid", { bpm: 100, energy: 0.5 })];
    expect(() => curateCompPlaylist(pool, [round])).toThrow(
      /No tracks match criteria/i
    );
  });

  it("counts required tracks across enabled rounds", () => {
    expect(
      countRequiredTracks([
        { ...round, heatCount: 2, songsPerHeat: 2 },
        { ...round, roundType: "final", enabled: false, heatCount: 3 },
      ])
    ).toBe(4);
  });
});

describe("validateCompPlaylistConfig", () => {
  const baseRound = {
    roundType: "prelims" as const,
    enabled: true,
    heatCount: 1,
    songsPerHeat: 2,
    songStructure: [
      { bpm: "low" as const, energy: [] as const[] },
      { bpm: "mid" as const, energy: ["high"] as const[] },
    ],
  };

  it("accepts valid config", () => {
    const result = validateCompPlaylistConfig({
      allowedPlaylistIds: ["abc123"],
      excludedPlaylistIds: [],
      rounds: [baseRound],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.allowedPlaylistIds).toEqual(["abc123"]);
    }
  });

  it("accepts slow_and_fast BPM on a song slot", () => {
    const result = validateCompPlaylistConfig({
      allowedPlaylistIds: ["abc123"],
      excludedPlaylistIds: [],
      rounds: [
        {
          ...baseRound,
          songsPerHeat: 1,
          songStructure: [{ bpm: "slow_and_fast", energy: [] }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing allowed playlists", () => {
    const result = validateCompPlaylistConfig({
      allowedPlaylistIds: [],
      excludedPlaylistIds: [],
      rounds: [baseRound],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects overlap between allowed and excluded", () => {
    const result = validateCompPlaylistConfig({
      allowedPlaylistIds: ["same"],
      excludedPlaylistIds: ["same"],
      rounds: [baseRound],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects mismatched song structure length", () => {
    const result = validateCompPlaylistConfig({
      allowedPlaylistIds: ["abc"],
      excludedPlaylistIds: [],
      rounds: [
        {
          ...baseRound,
          songsPerHeat: 3,
          songStructure: [{ bpm: "low", energy: [] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
