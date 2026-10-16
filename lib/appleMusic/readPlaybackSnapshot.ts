import { normalizeMusicKitMediaItem } from "@/lib/appleMusic/normalize";
import type { MusicKitInstance } from "@/lib/appleMusic/musicKitTypes";
import { appleMusicSongUri } from "@/lib/music/trackIdentity";

export type MusicKitPlaybackSnapshot = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
  currentTrackIsrc: string | null;
};

export function readMusicKitPlaybackSnapshot(
  music: MusicKitInstance
): MusicKitPlaybackSnapshot {
  const item = music.nowPlayingItem;
  const normalized = normalizeMusicKitMediaItem(item);
  const id = normalized?.catalogId ?? normalized?.libraryId ?? item?.id ?? null;
  return {
    isPlaying: music.isPlaying,
    positionMs: Math.max(0, Math.round(music.currentPlaybackTime * 1000)),
    durationMs: Math.max(
      0,
      Math.round(music.currentPlaybackDuration * 1000)
    ),
    currentTrackUri: id ? appleMusicSongUri(id) : null,
    currentTrackIsrc: normalized?.isrc ?? null,
  };
}

const TERMINAL_PLAYBACK_STATES = new Set(["completed", "ended"]);

export function isMusicKitPlaybackTerminalState(
  state: string | undefined
): boolean {
  return TERMINAL_PLAYBACK_STATES.has(state ?? "");
}
