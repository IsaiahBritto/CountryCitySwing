import { loadCachedAnalysisForTracks } from "@/lib/audioAnalysis/cache";
import { getValidAccessToken } from "@/lib/spotify/auth";
import {
  addTracksToPlaylist,
  fetchPlaylistTracks,
  fetchPlaylistTracksWithPositions,
  removePlaylistItemsAtPositions,
  type SpotifyTrack,
} from "@/lib/spotify/client";
import { invalidateMasterGenreCache } from "@/lib/spotify/activePlaylist";
import { getMasterPlaylistRefsForGenres } from "@/lib/spotify/masters";
import { upsertMasterGenreRow } from "@/lib/spotify/masterGenreDb";
import { resolveTrackFeatures } from "@/lib/spotify/features";
import {
  collectRemovalEntries,
  partitionVerifySaveItems,
  urisToAdd,
  type VerifyMusicSaveItem,
} from "@/lib/spotify/verifyMusicLogic";

export type { VerifyDance, VerifyMusicSaveItem } from "@/lib/spotify/verifyMusicLogic";
export { isVerifyDance } from "@/lib/spotify/verifyMusicLogic";

export type VerifyTrackRow = {
  trackId: string;
  uri: string;
  name: string;
  primaryArtist: string;
  durationMs: number;
  bpm: number | null;
  timeSignature: string | null;
  analysisStatus: "complete" | "missing";
};

export type VerifyMusicLoadResult = {
  countrySwingPlaylistId: string;
  tracks: VerifyTrackRow[];
};

export type VerifyMusicSaveResult = {
  addedTwoStep: number;
  addedWaltz: number;
  removedFromCountrySwing: number;
};

function mapTrackToVerifyRow(
  track: SpotifyTrack,
  analysis: {
    bpm: number | null;
    time_signature: string | null;
    analysis_status: string;
  } | null
): VerifyTrackRow {
  const complete =
    analysis?.analysis_status === "complete" &&
    analysis.bpm != null &&
    analysis.bpm > 0;

  return {
    trackId: track.id,
    uri: track.uri,
    name: track.name,
    primaryArtist: track.primaryArtist,
    durationMs: track.durationMs,
    bpm: complete ? Math.round(analysis!.bpm!) : null,
    timeSignature:
      analysis?.analysis_status === "complete" && analysis.time_signature
        ? analysis.time_signature
        : null,
    analysisStatus: complete ? "complete" : "missing",
  };
}

async function resolveVerifyMasterPlaylistIds(): Promise<{
  countrySwingPlaylistId: string;
  twoStepPlaylistId: string;
  waltzPlaylistId: string;
}> {
  const [cs, ts, wz] = await getMasterPlaylistRefsForGenres(["cs", "ts", "wz"]);
  return {
    countrySwingPlaylistId: cs.spotifyPlaylistId,
    twoStepPlaylistId: ts.spotifyPlaylistId,
    waltzPlaylistId: wz.spotifyPlaylistId,
  };
}

export async function loadCountrySwingVerifyRows(options?: {
  lookupMissing?: boolean;
}): Promise<VerifyMusicLoadResult> {
  const { accessToken } = await getValidAccessToken();
  const { countrySwingPlaylistId } = await resolveVerifyMasterPlaylistIds();

  let tracks = await fetchPlaylistTracks(accessToken, countrySwingPlaylistId);

  if (options?.lookupMissing) {
    await resolveTrackFeatures(tracks, {
      lookup: true,
      retryMode: "bpm_energy",
    });
  }

  const analysisById = await loadCachedAnalysisForTracks(tracks);

  const rows = tracks.map((track) => {
    const row = analysisById.get(track.id) ?? null;
    return mapTrackToVerifyRow(track, row);
  });

  return { countrySwingPlaylistId, tracks: rows };
}

async function addTracksDeduped(
  accessToken: string,
  playlistId: string,
  uris: string[]
): Promise<number> {
  if (uris.length === 0) return 0;

  const existing = await fetchPlaylistTracks(accessToken, playlistId, {
    dedupe: false,
  });
  const existingUris = new Set(existing.map((t) => t.uri));
  const toAdd = urisToAdd(uris, existingUris);
  if (toAdd.length === 0) return 0;

  await addTracksToPlaylist(accessToken, playlistId, toAdd);
  return toAdd.length;
}

export async function applyVerifyMusicSave(
  items: VerifyMusicSaveItem[]
): Promise<VerifyMusicSaveResult> {
  const { accessToken } = await getValidAccessToken();
  const {
    countrySwingPlaylistId,
    twoStepPlaylistId,
    waltzPlaylistId,
  } = await resolveVerifyMasterPlaylistIds();

  const { twoStep, waltz, reclassifiedTrackIds } =
    partitionVerifySaveItems(items);

  const addedTwoStep = await addTracksDeduped(
    accessToken,
    twoStepPlaylistId,
    twoStep.map((i) => i.uri)
  );
  const addedWaltz = await addTracksDeduped(
    accessToken,
    waltzPlaylistId,
    waltz.map((i) => i.uri)
  );

  const csItems = await fetchPlaylistTracksWithPositions(
    accessToken,
    countrySwingPlaylistId
  );
  const removalEntries = collectRemovalEntries(
    csItems,
    reclassifiedTrackIds
  );
  await removePlaylistItemsAtPositions(
    accessToken,
    countrySwingPlaylistId,
    removalEntries
  );

  for (const item of twoStep) {
    await upsertMasterGenreRow(item.trackId, "ts");
  }
  for (const item of waltz) {
    await upsertMasterGenreRow(item.trackId, "wz");
  }
  if (twoStep.length > 0 || waltz.length > 0) {
    invalidateMasterGenreCache();
  }

  return {
    addedTwoStep,
    addedWaltz,
    removedFromCountrySwing: removalEntries.length,
  };
}
