import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { resolveAudioAnalysis } from "@/lib/audioAnalysis/service";
import { isServerAppleMusic } from "@/lib/music/serverProvider";
import { fetchTrackIsrc } from "@/lib/spotify/client";
import type { GenrePool } from "@/lib/spotify/playlistIds";

export function isThreeFourTimeSignature(
  value: string | null | undefined
): boolean {
  if (!value?.trim()) return false;
  return value.trim() === "3/4";
}

export async function resolveTimeSignatureForSocialRequest(input: {
  trackId: string;
  name?: string;
  primaryArtist?: string;
  accessToken: string;
  requestIsrc?: string | null;
}): Promise<string | null> {
  const appleCatalogId = (await isServerAppleMusic()) ? input.trackId : null;
  const cached = await loadCachedAnalysisForTracks([
    { id: input.trackId, isrc: input.requestIsrc ?? null },
  ]);
  const row = cached.get(input.trackId) ?? null;
  if (row?.analysis_status === "complete" && row.time_signature?.trim()) {
    return row.time_signature.trim();
  }

  let isrc: string | null = input.requestIsrc?.trim() ?? null;
  if (!isrc && row?.isrc) {
    isrc = row.isrc;
  } else if (!isrc && !(await isServerAppleMusic())) {
    try {
      isrc = await fetchTrackIsrc(input.accessToken, input.trackId);
    } catch {
      isrc = null;
    }
  }

  const analysis = await resolveAudioAnalysis(
    [
      {
        spotifyTrackId: input.trackId,
        appleMusicCatalogId: appleCatalogId,
        isrc,
        name: input.name,
        primaryArtist: input.primaryArtist,
      },
    ],
    { allowExternalLookup: true, retryMode: "all_flags" }
  );

  const resolved =
    analysis.analysisRowsByTrackId.get(input.trackId) ??
    (appleCatalogId
      ? analysis.analysisRowsByTrackId.get(appleCatalogId) ?? null
      : null);
  if (resolved?.analysis_status === "complete" && resolved.time_signature?.trim()) {
    return resolved.time_signature.trim();
  }

  return null;
}

export async function resolveMasterGenreForSocialRequest(input: {
  requestGenre: GenrePool;
  trackId: string;
  name?: string;
  primaryArtist?: string;
  accessToken: string;
  requestIsrc?: string | null;
}): Promise<GenrePool> {
  if (input.requestGenre !== "cs") {
    return input.requestGenre;
  }

  const timeSignature = await resolveTimeSignatureForSocialRequest({
    trackId: input.trackId,
    name: input.name,
    primaryArtist: input.primaryArtist,
    accessToken: input.accessToken,
    requestIsrc: input.requestIsrc,
  });

  return isThreeFourTimeSignature(timeSignature) ? "wz" : "cs";
}
