import { getSlotLabel, ROUND_SLOT_ORDER } from "@/lib/comps/roundChain";
import type { RoundType } from "@/lib/comps/types";
import {
  formatSlotCriteria,
  trackMatchesSlot,
  type CompPoolTrack,
} from "@/lib/spotify/compCriteria";
import type {
  CompPlaylistRoundConfig,
  CompPlaylistSongSlot,
} from "@/lib/spotify/compPlaylistTypes";

export type CuratedCompTrack = CompPoolTrack & {
  roundType: RoundType;
  heatNumber: number;
  songNumber: number;
  slot: CompPlaylistSongSlot;
};

export type CurateCompResult = {
  tracks: CuratedCompTrack[];
  durationMs: number;
};

function artistKey(name: string): string {
  return name.trim().toLowerCase();
}

function pickRandom<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function pickTrackForSlot(
  pool: CompPoolTrack[],
  slot: CompPlaylistSongSlot,
  previousArtist: string | null,
  rng: () => number
): CompPoolTrack {
  const matches = pool.filter((track) => trackMatchesSlot(track.features, slot));
  if (matches.length === 0) {
    throw new Error(
      `No tracks match criteria: ${formatSlotCriteria(slot)}`
    );
  }

  let window = matches;
  if (previousArtist) {
    const prev = artistKey(previousArtist);
    const differentArtist = matches.filter(
      (track) => artistKey(track.primaryArtist) !== prev
    );
    if (differentArtist.length > 0) {
      window = differentArtist;
    }
  }

  return pickRandom(window, rng);
}

export function countRequiredTracks(rounds: CompPlaylistRoundConfig[]): number {
  let total = 0;
  for (const round of rounds) {
    if (!round.enabled) continue;
    total += round.heatCount * round.songsPerHeat;
  }
  return total;
}

export function curateCompPlaylist(
  pool: CompPoolTrack[],
  rounds: CompPlaylistRoundConfig[],
  options?: { rng?: () => number }
): CurateCompResult {
  const rng = options?.rng ?? Math.random;
  const remaining = [...pool];
  const playlist: CuratedCompTrack[] = [];
  let elapsed = 0;
  let previousArtist: string | null = null;

  const roundsByType = new Map(rounds.map((round) => [round.roundType, round]));

  for (const roundType of ROUND_SLOT_ORDER) {
    const round = roundsByType.get(roundType);
    if (!round?.enabled) continue;

    for (let heat = 1; heat <= round.heatCount; heat++) {
      for (let song = 0; song < round.songsPerHeat; song++) {
        const slot = round.songStructure[song];
        if (!slot) {
          throw new Error(
            `Missing song structure for ${getSlotLabel(roundType)} heat ${heat} song ${song + 1}`
          );
        }

        const picked = pickTrackForSlot(remaining, slot, previousArtist, rng);
        const index = remaining.findIndex((track) => track.id === picked.id);
        if (index >= 0) remaining.splice(index, 1);

        playlist.push({
          ...picked,
          roundType,
          heatNumber: heat,
          songNumber: song + 1,
          slot,
        });
        elapsed += picked.durationMs;
        previousArtist = picked.primaryArtist;
      }
    }
  }

  return { tracks: playlist, durationMs: elapsed };
}

export function formatCurateSlotError(
  roundType: RoundType,
  heatNumber: number,
  songNumber: number,
  slot: CompPlaylistSongSlot,
  message: string
): string {
  return `${getSlotLabel(roundType)} heat ${heatNumber} song ${songNumber}: ${message} (${formatSlotCriteria(slot)})`;
}
