import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { resolveAudioAnalysis } from "@/lib/audioAnalysis/service";
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
}): Promise<string | null> {
  const cached = await loadCachedAnalysisForTracks([
    { id: input.trackId },
  ]);
  const row = cached.get(input.trackId) ?? null;
  if (row?.analysis_status === "complete" && row.time_signature?.trim()) {
    return row.time_signature.trim();
  }

  let isrc: string | null = null;
  if (row?.isrc) {
    isrc = row.isrc;
  } else {
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
        isrc,
        name: input.name,
        primaryArtist: input.primaryArtist,
      },
    ],
    { allowExternalLookup: true, retryMode: "all_flags" }
  );

  const resolved = analysis.analysisRowsByTrackId.get(input.trackId) ?? null;
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
}): Promise<GenrePool> {
  if (input.requestGenre !== "cs") {
    return input.requestGenre;
  }

  const timeSignature = await resolveTimeSignatureForSocialRequest({
    trackId: input.trackId,
    name: input.name,
    primaryArtist: input.primaryArtist,
    accessToken: input.accessToken,
  });

  return isThreeFourTimeSignature(timeSignature) ? "wz" : "cs";
}
