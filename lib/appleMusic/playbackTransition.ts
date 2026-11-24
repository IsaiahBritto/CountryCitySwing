import type {
  MusicKitInstance,
  MusicKitPlaybackState,
} from "@/lib/appleMusic/musicKitTypes";

/** States where MusicKit rejects setQueue+play() without stop/pause first. */
export function playbackStateNeedsResetBeforeNewQueue(
  state: MusicKitPlaybackState | undefined,
  isPlaying: boolean
): boolean {
  if (isPlaying) return false;
  switch (state) {
    case "playing":
    case "waiting":
    case "seeking":
    case "loading":
    case "completed":
    case "ended":
    case "interrupted":
      return true;
    default:
      return false;
  }
}

/** Resume same queue item: paused/stopped/none can call play() directly. */
export function resumeNeedsPauseBeforePlay(
  state: MusicKitPlaybackState | undefined,
  isPlaying: boolean
): boolean {
  if (isPlaying) return false;
  if (state === "paused" || state === "stopped" || state === "none") {
    return false;
  }
  return playbackStateNeedsResetBeforeNewQueue(state, isPlaying);
}

export async function ensurePlaybackIdleBeforeNewQueue(
  music: MusicKitInstance
): Promise<void> {
  if (music.isPlaying) {
    await music.pause();
    return;
  }
  if (
    playbackStateNeedsResetBeforeNewQueue(
      music.currentPlaybackState,
      music.isPlaying
    )
  ) {
    await music.stop();
  }
}

export async function ensureReadyForResume(
  music: MusicKitInstance
): Promise<void> {
  if (music.isPlaying) return;
  if (
    resumeNeedsPauseBeforePlay(music.currentPlaybackState, music.isPlaying)
  ) {
    await music.pause();
  }
}
