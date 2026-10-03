import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";
import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  SONG_CRITERIA_TIERS,
  type BpmSlotTier,
  type CompPlaylistSongSlot,
  type SongCriteriaTier,
} from "@/lib/spotify/compPlaylistTypes";

export type NumericRange = { min: number; max: number };

export const BPM_RANGES: Record<SongCriteriaTier, NumericRange> = {
  low: { min: 60, max: 80 },
  mid: { min: 81, max: 119 },
  high: { min: 120, max: 160 },
};

export const ENERGY_RANGES: Record<SongCriteriaTier, NumericRange> = {
  low: { min: 0, max: 0.4 },
  mid: { min: 0.41, max: 0.65 },
  high: { min: 0.66, max: 1 },
};

export function valueInRange(value: number, range: NumericRange): boolean {
  return value >= range.min && value <= range.max;
}

export function normalizeEnergyTiers(
  tiers: SongCriteriaTier[] | null | undefined
): SongCriteriaTier[] | null {
  if (!tiers || tiers.length === 0) return null;
  const unique = SONG_CRITERIA_TIERS.filter((tier) => tiers.includes(tier));
  if (unique.length === 0 || unique.length === SONG_CRITERIA_TIERS.length) {
    return null;
  }
  return unique;
}

export function energyFilterActive(
  tiers: SongCriteriaTier[] | null | undefined
): boolean {
  return normalizeEnergyTiers(tiers) !== null;
}

/** Primary Musicae BPM only — comp slots ignore half/double-time alternates. */
export function compSlotBpm(features: ResolvedTrackFeatures): number {
  return features.bpm;
}

export function trackMatchesBpm(
  features: ResolvedTrackFeatures,
  bpmTier: BpmSlotTier
): boolean {
  if (!features.trueBpm) return false;
  const bpm = compSlotBpm(features);
  if (bpmTier === "slow_and_fast") {
    return (
      valueInRange(bpm, BPM_RANGES.low) || valueInRange(bpm, BPM_RANGES.high)
    );
  }
  return valueInRange(bpm, BPM_RANGES[bpmTier]);
}

export function trackMatchesEnergy(
  features: ResolvedTrackFeatures,
  energyTiers: SongCriteriaTier[] | null | undefined
): boolean {
  const active = normalizeEnergyTiers(energyTiers);
  if (!active) return true;
  if (!features.trueEnergy) return false;
  return active.some((tier) =>
    valueInRange(features.energy, ENERGY_RANGES[tier])
  );
}

export function trackMatchesSlot(
  features: ResolvedTrackFeatures,
  slot: CompPlaylistSongSlot
): boolean {
  return (
    trackMatchesBpm(features, slot.bpm) &&
    trackMatchesEnergy(features, slot.energy)
  );
}

export type SlotMatchEvaluation = {
  bpmOk: boolean;
  energyOk: boolean;
  matchesSlot: boolean;
};

export function evaluateSlotMatch(
  features: ResolvedTrackFeatures,
  slot: CompPlaylistSongSlot
): SlotMatchEvaluation {
  const bpmOk = trackMatchesBpm(features, slot.bpm);
  const energyOk = trackMatchesEnergy(features, slot.energy);
  return {
    bpmOk,
    energyOk,
    matchesSlot: bpmOk && energyOk,
  };
}

export type CompPoolTrack = SpotifyTrack & {
  features: ResolvedTrackFeatures;
};

export function formatSlotCriteria(slot: CompPlaylistSongSlot): string {
  const bpmLabel =
    slot.bpm === "slow_and_fast"
      ? `slow + fast BPM (${BPM_RANGES.low.min}–${BPM_RANGES.low.max} or ${BPM_RANGES.high.min}–${BPM_RANGES.high.max})`
      : `${slot.bpm} BPM (${BPM_RANGES[slot.bpm].min}–${BPM_RANGES[slot.bpm].max})`;
  const active = normalizeEnergyTiers(slot.energy);
  if (!active) {
    return `${bpmLabel}, any energy`;
  }
  const energyLabel = active
    .map((tier) => `${tier} (${ENERGY_RANGES[tier].min}–${ENERGY_RANGES[tier].max})`)
    .join(" or ");
  return `${bpmLabel}, energy: ${energyLabel}`;
}
