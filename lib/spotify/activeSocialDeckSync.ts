import type { DeckTrack } from "@/lib/spotify/djDeckState";
import {
  playlistTrackIdsFingerprint,
  playlistsNeedSnapshotSync,
} from "@/lib/spotify/deckPlaylistSync";

export { playlistTrackIdsFingerprint, playlistsNeedSnapshotSync };

export type ActiveSocialDeckTracksResponse = {
  tracks: DeckTrack[];
  totalDurationMs: number;
  playlistId?: string;
};

export function shouldSyncDeckToSnapshot(
  localPlaylist: DeckTrack[],
  remoteTracks: DeckTrack[]
): boolean {
  return playlistsNeedSnapshotSync(localPlaylist, remoteTracks);
}
