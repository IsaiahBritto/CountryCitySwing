import type { RoundType } from "@/lib/comps/types";
import { ROUND_SLOT_ORDER } from "@/lib/comps/roundChain";

export type SongCriteriaTier = "low" | "mid" | "high";

export const SONG_CRITERIA_TIERS: SongCriteriaTier[] = ["low", "mid", "high"];

/** BPM band per song slot (includes dual slow+fast band). */
export type BpmSlotTier = SongCriteriaTier | "slow_and_fast";

export const BPM_SLOT_TIERS: BpmSlotTier[] = [
  "low",
  "mid",
  "high",
  "slow_and_fast",
];

export type CompPlaylistSongSlot = {
  bpm: BpmSlotTier;
  energy: SongCriteriaTier[];
};

/** One row in the post-generate admin preview manifest. */
export type CompPlaylistEntry = {
  roundType: RoundType;
  heatNumber: number;
  songNumber: number;
  slot: CompPlaylistSongSlot;
  slotLabel: string;
  track: {
    id: string;
    name: string;
    primaryArtist: string;
    uri: string;
  };
  bpm: number;
  energy: number;
  trueBpm: boolean;
  trueEnergy: boolean;
  bpmOk: boolean;
  energyOk: boolean;
  matchesSlot: boolean;
};

export type CompPlaylistRoundConfig = {
  roundType: RoundType;
  enabled: boolean;
  heatCount: number;
  songsPerHeat: number;
  songStructure: CompPlaylistSongSlot[];
};

export type CompPlaylistConfig = {
  allowedPlaylistIds: string[];
  excludedPlaylistIds: string[];
  rounds: CompPlaylistRoundConfig[];
};

export type CompPlaylistConfigRow = {
  competition_id: string;
  allowed_playlist_ids: string[];
  excluded_playlist_ids: string[];
  rounds: CompPlaylistRoundConfig[];
  last_spotify_playlist_id: string | null;
  last_spotify_playlist_url: string | null;
  last_generated_at: string | null;
  updated_at: string;
};

export function defaultRoundConfigs(): CompPlaylistRoundConfig[] {
  return ROUND_SLOT_ORDER.map((roundType) => ({
    roundType,
    enabled: false,
    heatCount: 1,
    songsPerHeat: 3,
    songStructure: [
      { bpm: "low", energy: [] },
      { bpm: "mid", energy: [] },
      { bpm: "high", energy: ["low"] },
    ],
  }));
}

export function defaultCompPlaylistConfig(): CompPlaylistConfig {
  return {
    allowedPlaylistIds: [],
    excludedPlaylistIds: [],
    rounds: defaultRoundConfigs(),
  };
}

export function rowToConfig(row: CompPlaylistConfigRow): CompPlaylistConfig {
  return {
    allowedPlaylistIds: row.allowed_playlist_ids ?? [],
    excludedPlaylistIds: row.excluded_playlist_ids ?? [],
    rounds:
      Array.isArray(row.rounds) && row.rounds.length > 0
        ? row.rounds
        : defaultRoundConfigs(),
  };
}
