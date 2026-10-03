import {
  fetchPlaylistTracksWithPositions,
  removePlaylistItemsAtPositions,
} from "@/lib/spotify/client";
import { invalidateMasterGenreCache } from "@/lib/spotify/activePlaylist";
import { getMasterPlaylistRefsForGenres } from "@/lib/spotify/masters";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  collectIsrcDuplicateRemovals,
  type IsrcDuplicateScan,
} from "@/lib/spotify/masterIsrcIndex";

export {
  buildCanonicalTrackByIsrc,
  collectIsrcDuplicateRemovals,
  type IsrcDuplicateScan,
  type PlaylistTrackAtPosition,
} from "@/lib/spotify/masterIsrcIndex";

async function deleteMasterGenreRows(trackIds: string[]): Promise<void> {
  if (trackIds.length === 0) return;
  const chunkSize = 100;
  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const { error } = await supabaseServer
      .from("spotify_master_track_genre")
      .delete()
      .in("spotify_track_id", chunk);
    if (error) {
      console.warn("Failed to delete master genre rows after ISRC dedupe:", error);
    }
  }
}

export async function dedupeMasterPlaylistIsrc(input: {
  accessToken: string;
  spotifyPlaylistId: string;
  genre: GenrePool;
}): Promise<IsrcDuplicateScan> {
  const items = await fetchPlaylistTracksWithPositions(
    input.accessToken,
    input.spotifyPlaylistId
  );
  const { removals, removedTrackIds, ...stats } =
    collectIsrcDuplicateRemovals(items);

  if (removals.length > 0) {
    await removePlaylistItemsAtPositions(
      input.accessToken,
      input.spotifyPlaylistId,
      removals
    );
    await deleteMasterGenreRows(removedTrackIds);
    invalidateMasterGenreCache();
  }

  return {
    ...stats,
    removedTrackIds,
  };
}

export type DedupeAllMastersResult = {
  totals: IsrcDuplicateScan;
  byPlaylist: Array<
    IsrcDuplicateScan & {
      linkId: string;
      label: string;
      spotifyPlaylistId: string;
      genre: GenrePool;
    }
  >;
};

export async function dedupeMasterPlaylistsIsrc(input: {
  accessToken: string;
  playlistIds?: string[];
}): Promise<DedupeAllMastersResult> {
  const allGenres: GenrePool[] = ["cs", "wcs", "ld", "ts", "wz"];
  let masters = await getMasterPlaylistRefsForGenres(allGenres);
  if (input.playlistIds?.length) {
    const idSet = new Set(input.playlistIds);
    masters = masters.filter((m) => idSet.has(m.spotifyPlaylistId));
  }

  const byPlaylist: DedupeAllMastersResult["byPlaylist"] = [];
  const totals: IsrcDuplicateScan = {
    scanned: 0,
    groupsWithDuplicates: 0,
    removed: 0,
    skippedNoIsrc: 0,
    removedTrackIds: [],
  };

  for (const master of masters) {
    const result = await dedupeMasterPlaylistIsrc({
      accessToken: input.accessToken,
      spotifyPlaylistId: master.spotifyPlaylistId,
      genre: master.genre,
    });
    byPlaylist.push({
      ...result,
      linkId: master.linkId,
      label: master.label,
      spotifyPlaylistId: master.spotifyPlaylistId,
      genre: master.genre,
    });
    totals.scanned += result.scanned;
    totals.groupsWithDuplicates += result.groupsWithDuplicates;
    totals.removed += result.removed;
    totals.skippedNoIsrc += result.skippedNoIsrc;
    totals.removedTrackIds.push(...result.removedTrackIds);
  }

  return { totals, byPlaylist };
}
