import type { SpotifyTrack } from "@/lib/spotify/client";
import {
  analysisRowToResolvedFeatures,
} from "@/lib/audioAnalysis/map";
import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { resolveAudioAnalysis } from "@/lib/audioAnalysis/service";
import {
  FEATURE_DEFAULTS,
  needsBpmOrEnergyLookup,
  needsFeatureLookup,
  selectTracksNeedingAnalysisLookup,
  selectTracksNeedingLookup,
  type FeatureRetryMode,
  type TrackFeaturesRow,
} from "@/lib/spotify/featureFlags";
import type { ResolvedTrackFeatures } from "@/lib/spotify/curate";

export {
  FEATURE_DEFAULTS,
  isRetryImmediatelyAnalysisError,
  needsAnalysisLookup,
  needsBpmOrEnergyLookup,
  needsFeatureLookup,
  selectTracksNeedingAnalysisLookup,
  selectTracksNeedingLookup,
  type FeatureRetryMode,
  type TrackFeaturesRow,
} from "@/lib/spotify/featureFlags";
export type { ResolvedTrackFeatures };

export type ResolveTrackFeaturesOptions = {
  /** When false, skip external lookup and do not write default rows to Supabase. */
  lookup?: boolean;
  /** Which incomplete flags trigger a retry when lookup is true. */
  retryMode?: FeatureRetryMode;
};

export type ResolveFeaturesResult = {
  featuresById: Map<string, ResolvedTrackFeatures>;
  scanned: number;
  lookedUp: number;
  stillUnknown: number;
};

/**
 * Load Musicae cache, optionally lookup gaps via Musicae only, return resolved features.
 */
export async function resolveTrackFeatures(
  tracks: SpotifyTrack[],
  options?: ResolveTrackFeaturesOptions
): Promise<ResolveFeaturesResult> {
  const lookup = options?.lookup !== false;
  const retryMode: FeatureRetryMode = options?.retryMode ?? "all_flags";

  const unique = new Map<string, SpotifyTrack>();
  for (const t of tracks) unique.set(t.id, t);
  const list = [...unique.values()];

  const cachedAnalysis = await loadCachedAnalysisForTracks(list);

  let lookedUp = 0;
  if (lookup) {
    const needing = selectTracksNeedingAnalysisLookup(
      list,
      cachedAnalysis,
      retryMode
    );
    if (needing.length > 0) {
      const analysis = await resolveAudioAnalysis(
        needing.map((t) => ({
          spotifyTrackId: t.id,
          isrc: t.isrc,
          name: t.name,
          primaryArtist: t.primaryArtist,
        })),
        {
          allowExternalLookup: true,
          retryMode,
        }
      );
      lookedUp = analysis.musicaeLookups;
      for (const [id, row] of analysis.analysisRowsByTrackId) {
        cachedAnalysis.set(id, row);
      }
    }
  }

  const featuresById = new Map<string, ResolvedTrackFeatures>();
  let stillUnknown = 0;
  for (const track of list) {
    const row = cachedAnalysis.get(track.id) ?? null;
    const resolved = analysisRowToResolvedFeatures(track.id, row);
    featuresById.set(track.id, resolved);

    const unknown =
      retryMode === "bpm_energy"
        ? !resolved.trueBpm || !resolved.trueEnergy
        : !resolved.trueBpm ||
          !resolved.trueEnergy ||
          !resolved.trueDanceability ||
          !resolved.trueValence ||
          !resolved.trueMood ||
          !resolved.trueCamelot;
    if (unknown) stillUnknown += 1;
  }

  return {
    featuresById,
    scanned: list.length,
    lookedUp,
    stillUnknown,
  };
}
