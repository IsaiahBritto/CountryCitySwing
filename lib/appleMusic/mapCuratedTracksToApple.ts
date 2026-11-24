import { fetchCatalogSongsByIsrc } from "@/lib/appleMusic/client";
import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { normalizeIsrc } from "@/lib/musicae/isrc";
import type { NormalizedTrack } from "@/lib/music/types";
import {
  effectiveBpm,
  pickReplacementCurateTrack,
  type CurateTrack,
} from "@/lib/spotify/curate";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export type MapCuratedToAppleInput = {
  curatedTracks: CurateTrack[];
  pools: Record<GenrePool, CurateTrack[]>;
  developerToken: string;
  storefront: string;
};

export type MapCuratedToAppleResult = {
  appleCatalogSongIds: string[];
  replacedForApple: number;
};

function catalogIdFromNormalized(track: NormalizedTrack | undefined): string | null {
  if (!track?.catalogId?.trim()) return null;
  return track.catalogId.trim();
}

export function resolveIsrcForCurateTrack(
  track: CurateTrack,
  analysisIsrc: string | null | undefined
): string | null {
  return normalizeIsrc(track.isrc) ?? normalizeIsrc(analysisIsrc);
}

export async function collectIsrcsFromCuratePools(
  pools: Record<GenrePool, CurateTrack[]>
): Promise<{ isrcs: string[]; isrcByTrackId: Map<string, string> }> {
  const allPoolTracks: CurateTrack[] = [];
  for (const genre of Object.keys(pools) as GenrePool[]) {
    allPoolTracks.push(...(pools[genre] ?? []));
  }
  const analysis = await loadCachedAnalysisForTracks(
    allPoolTracks.map((t) => ({ id: t.id, isrc: t.isrc ?? null }))
  );
  const isrcByTrackId = new Map<string, string>();
  const isrcSet = new Set<string>();
  for (const track of allPoolTracks) {
    const isrc = resolveIsrcForCurateTrack(
      track,
      analysis.get(track.id)?.isrc
    );
    if (!isrc) continue;
    isrcByTrackId.set(track.id, isrc);
    isrcSet.add(isrc);
  }
  return { isrcs: [...isrcSet], isrcByTrackId };
}

export async function mapCuratedTracksToApple(
  input: MapCuratedToAppleInput
): Promise<MapCuratedToAppleResult> {
  const { isrcByTrackId } = await collectIsrcsFromCuratePools(input.pools);
  const appleByIsrc = await fetchCatalogSongsByIsrc({
    developerToken: input.developerToken,
    storefront: input.storefront,
    isrcs: [...new Set(isrcByTrackId.values())],
  });

  const usedSpotifyIds = new Set<string>();
  const appleCatalogSongIds: string[] = [];
  let replacedForApple = 0;

  const appleIdForTrack = (track: CurateTrack): string | null => {
    const isrc = isrcByTrackId.get(track.id);
    if (!isrc) return null;
    return catalogIdFromNormalized(appleByIsrc.get(isrc));
  };

  let previousArtist: string | null = null;

  for (const row of input.curatedTracks) {
    let chosen: CurateTrack | null = row;
    let catalogId = appleIdForTrack(row);

    if (!catalogId) {
      chosen = pickReplacementCurateTrack(input.pools[row.genre] ?? [], {
        excludeIds: usedSpotifyIds,
        previousArtist,
        targetEnergy: row.features.energy,
        targetBpm: effectiveBpm(row.features),
        eligible: (t) => Boolean(appleIdForTrack(t)),
      });
      if (!chosen) {
        throw new Error(
          `Not enough Apple Music catalog tracks for ${row.genre.toUpperCase()} after ISRC lookup. Add masters or sync features.`
        );
      }
      catalogId = appleIdForTrack(chosen);
      if (!catalogId) {
        throw new Error(
          `Could not resolve Apple catalog id for replacement in ${row.genre.toUpperCase()}.`
        );
      }
      if (chosen.id !== row.id) replacedForApple += 1;
    }

    usedSpotifyIds.add(chosen.id);
    appleCatalogSongIds.push(catalogId);
    previousArtist = chosen.primaryArtist;
  }

  return { appleCatalogSongIds, replacedForApple };
}
