import { ROUND_SLOT_ORDER } from "@/lib/comps/roundChain";
import { BPM_SLOT_TIERS, SONG_CRITERIA_TIERS } from "@/lib/spotify/compPlaylistTypes";
import type {
  BpmSlotTier,
  CompPlaylistConfig,
  CompPlaylistRoundConfig,
  CompPlaylistSongSlot,
  SongCriteriaTier,
} from "@/lib/spotify/compPlaylistTypes";

export type ValidateCompPlaylistResult =
  | { ok: true; config: CompPlaylistConfig }
  | { ok: false; error: string };

function isSongCriteriaTier(value: unknown): value is SongCriteriaTier {
  return (
    typeof value === "string" &&
    (SONG_CRITERIA_TIERS as readonly string[]).includes(value)
  );
}

function isBpmSlotTier(value: unknown): value is BpmSlotTier {
  return (
    typeof value === "string" &&
    (BPM_SLOT_TIERS as readonly string[]).includes(value)
  );
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string");
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function parseEnergyTiers(value: unknown): SongCriteriaTier[] {
  if (!Array.isArray(value)) return [];
  const tiers = value.filter(isSongCriteriaTier);
  return SONG_CRITERIA_TIERS.filter((tier) => tiers.includes(tier));
}

function normalizeSlotEnergy(energy: SongCriteriaTier[]): SongCriteriaTier[] {
  const active = SONG_CRITERIA_TIERS.filter((tier) => energy.includes(tier));
  if (active.length === 0 || active.length === SONG_CRITERIA_TIERS.length) {
    return [];
  }
  return active;
}

function parseSongSlot(value: unknown): CompPlaylistSongSlot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isBpmSlotTier(row.bpm)) return null;
  return {
    bpm: row.bpm,
    energy: normalizeSlotEnergy(parseEnergyTiers(row.energy)),
  };
}

function parseRoundConfig(value: unknown): CompPlaylistRoundConfig | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const roundType = row.roundType;
  if (
    typeof roundType !== "string" ||
    !ROUND_SLOT_ORDER.includes(roundType as CompPlaylistRoundConfig["roundType"])
  ) {
    return null;
  }

  const enabled = row.enabled === true;
  const heatCount =
    typeof row.heatCount === "number" ? Math.floor(row.heatCount) : 1;
  const songsPerHeat =
    typeof row.songsPerHeat === "number" ? Math.floor(row.songsPerHeat) : 1;
  const songStructureRaw = Array.isArray(row.songStructure)
    ? row.songStructure
    : [];

  const songStructure = songStructureRaw
    .map(parseSongSlot)
    .filter((slot): slot is CompPlaylistSongSlot => slot !== null);

  return {
    roundType: roundType as CompPlaylistRoundConfig["roundType"],
    enabled,
    heatCount,
    songsPerHeat,
    songStructure,
  };
}

function mergeRounds(input: CompPlaylistRoundConfig[]): CompPlaylistRoundConfig[] {
  const byType = new Map(input.map((round) => [round.roundType, round]));
  return ROUND_SLOT_ORDER.map((roundType) => {
    const existing = byType.get(roundType);
    if (existing) return existing;
    return {
      roundType,
      enabled: false,
      heatCount: 1,
      songsPerHeat: 3,
      songStructure: [
        { bpm: "low" as const, energy: [] },
        { bpm: "mid" as const, energy: [] },
        { bpm: "high" as const, energy: ["low"] as SongCriteriaTier[] },
      ],
    };
  });
}

export function validateCompPlaylistConfig(
  body: unknown
): ValidateCompPlaylistResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid config payload" };
  }

  const row = body as Record<string, unknown>;
  const allowedPlaylistIds = parseStringArray(row.allowedPlaylistIds);
  const excludedPlaylistIds = parseStringArray(row.excludedPlaylistIds);

  if (!allowedPlaylistIds) {
    return { ok: false, error: "allowedPlaylistIds must be an array of strings" };
  }
  if (!excludedPlaylistIds) {
    return { ok: false, error: "excludedPlaylistIds must be an array of strings" };
  }
  if (allowedPlaylistIds.length === 0) {
    return { ok: false, error: "At least one allowed playlist is required" };
  }

  const overlap = allowedPlaylistIds.filter((id) =>
    excludedPlaylistIds.includes(id)
  );
  if (overlap.length > 0) {
    return {
      ok: false,
      error: "A playlist cannot be both allowed and excluded",
    };
  }

  const roundsRaw = Array.isArray(row.rounds) ? row.rounds : [];
  const parsedRounds = roundsRaw
    .map(parseRoundConfig)
    .filter((round): round is CompPlaylistRoundConfig => round !== null);
  const rounds = mergeRounds(parsedRounds);

  const enabledRounds = rounds.filter((round) => round.enabled);
  if (enabledRounds.length === 0) {
    return { ok: false, error: "Enable at least one round" };
  }

  for (const round of enabledRounds) {
    const label = round.roundType;
    if (round.heatCount < 1) {
      return { ok: false, error: `${label}: heat count must be at least 1` };
    }
    if (round.songsPerHeat < 1) {
      return {
        ok: false,
        error: `${label}: songs per heat must be at least 1`,
      };
    }
    if (round.songStructure.length !== round.songsPerHeat) {
      return {
        ok: false,
        error: `${label}: song structure must have ${round.songsPerHeat} slot(s)`,
      };
    }
  }

  return {
    ok: true,
    config: {
      allowedPlaylistIds,
      excludedPlaylistIds,
      rounds,
    },
  };
}

export function configToRow(config: CompPlaylistConfig) {
  return {
    allowed_playlist_ids: config.allowedPlaylistIds,
    excluded_playlist_ids: config.excludedPlaylistIds,
    rounds: config.rounds,
    updated_at: new Date().toISOString(),
  };
}
