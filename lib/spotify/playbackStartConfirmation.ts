import { parseSpotifyApiError } from "@/lib/spotify/spotifyApiErrors";
import { trackUrisMatch } from "@/lib/spotify/trackUri";

export type MappedPlaybackState = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
};

export const PLAYBACK_POLL_INTERVAL_MS = 150;
export const PLAYBACK_POLL_MAX_MS = 3000;
export const PLAYBACK_POSITION_ADVANCE_MS = 200;
export const PLAYBACK_PLAY_ATTEMPT_WINDOW_MS = 5000;

export function isUriMatchForPlayback(
  requestedUri: string,
  sdkUri: string | null | undefined
): boolean {
  return trackUrisMatch(requestedUri, sdkUri);
}

export function isPlaybackConfirmed(
  requestedUri: string,
  mapped: MappedPlaybackState | null
): boolean {
  if (!mapped) return false;
  return (
    mapped.isPlaying &&
    isUriMatchForPlayback(requestedUri, mapped.currentTrackUri)
  );
}

export function shouldAttemptResumeBeforePlay(
  mapped: MappedPlaybackState | null,
  requestedUri: string
): boolean {
  if (!mapped) return false;
  if (mapped.isPlaying) return false;
  return isUriMatchForPlayback(requestedUri, mapped.currentTrackUri);
}

export function hasPositionAdvanced(
  before: MappedPlaybackState,
  after: MappedPlaybackState,
  minDeltaMs = 100
): boolean {
  return after.positionMs - before.positionMs >= minDeltaMs;
}

export function resolvePlayConfirmationFailure(input: {
  lastSdkError?: string | null;
  persistentStateNull: boolean;
}): string {
  if (input.lastSdkError?.trim()) {
    return parseSpotifyApiError(input.lastSdkError).message;
  }
  if (input.persistentStateNull) {
    return "Playback moved to another device — close Spotify on other devices and try again.";
  }
  return "Playback didn't start in this browser. Tap Play again or skip to the next track.";
}

export type PlaybackPollDeps = {
  syncState: () => Promise<MappedPlaybackState | null>;
  tryResume: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
};

export type PlaybackPollResult = {
  ok: boolean;
  mapped: MappedPlaybackState | null;
  persistentStateNull: boolean;
};

export async function pollPlaybackConfirmation(
  requestedUri: string,
  deps: PlaybackPollDeps,
  options?: { maxMs?: number; intervalMs?: number }
): Promise<PlaybackPollResult> {
  const maxMs = options?.maxMs ?? PLAYBACK_POLL_MAX_MS;
  const intervalMs = options?.intervalMs ?? PLAYBACK_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  let resumeAttempted = false;
  let lastMapped: MappedPlaybackState | null = null;
  let sawNonNull = false;

  while (Date.now() - startedAt < maxMs) {
    const mapped = await deps.syncState();
    lastMapped = mapped;
    if (mapped) {
      sawNonNull = true;
      if (isPlaybackConfirmed(requestedUri, mapped)) {
        return { ok: true, mapped, persistentStateNull: false };
      }
      if (
        !resumeAttempted &&
        shouldAttemptResumeBeforePlay(mapped, requestedUri)
      ) {
        resumeAttempted = true;
        await deps.tryResume();
        await deps.sleep(intervalMs);
        continue;
      }
    }
    await deps.sleep(intervalMs);
  }

  if (
    lastMapped &&
    shouldAttemptResumeBeforePlay(lastMapped, requestedUri) &&
    !resumeAttempted
  ) {
    resumeAttempted = true;
    await deps.tryResume();
    const afterResume = await deps.syncState();
    lastMapped = afterResume;
    if (afterResume) {
      sawNonNull = true;
      if (isPlaybackConfirmed(requestedUri, afterResume)) {
        return { ok: true, mapped: afterResume, persistentStateNull: false };
      }
    }
  }

  if (
    lastMapped &&
    isUriMatchForPlayback(requestedUri, lastMapped.currentTrackUri) &&
    lastMapped.isPlaying
  ) {
    return { ok: true, mapped: lastMapped, persistentStateNull: false };
  }

  if (
    lastMapped &&
    isUriMatchForPlayback(requestedUri, lastMapped.currentTrackUri) &&
    !lastMapped.isPlaying
  ) {
    const sampleA = lastMapped;
    await deps.sleep(PLAYBACK_POSITION_ADVANCE_MS);
    const sampleB = await deps.syncState();
    if (
      sampleB &&
      isUriMatchForPlayback(requestedUri, sampleB.currentTrackUri) &&
      hasPositionAdvanced(sampleA, sampleB)
    ) {
      return { ok: true, mapped: sampleB, persistentStateNull: false };
    }
    lastMapped = sampleB ?? lastMapped;
  }

  const persistentStateNull = !sawNonNull;
  return { ok: false, mapped: lastMapped, persistentStateNull };
}
