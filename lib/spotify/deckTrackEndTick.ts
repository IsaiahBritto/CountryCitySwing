import {
  crossfadeSecondsToMs,
  type DeckTrack,
} from "@/lib/spotify/djDeckState";
import {
  shouldAttemptHandoffAtEnd,
  shouldTriggerNormalTrackEnd,
} from "@/lib/spotify/deckTrackEnd";
import { isNearTrackEnd } from "@/lib/spotify/playerFade";
import { trackUrisMatch } from "@/lib/spotify/trackUri";

export type TrackEndTickInput = {
  activeTrackUri: string | null;
  activeDurationMs: number;
  clockPositionMs: number;
  sdkUri: string | null;
  sdkPositionMs: number;
  sdkDurationMs: number;
  sdkIsPlaying: boolean;
  activeDeckTrackUri: string | null;
  handoffInProgress: boolean;
  wasPlayingActiveTrack: boolean;
  prevActivePositionMs: number;
  secondDeckEnabled: boolean;
  handoffToOtherDeckAfterSong: boolean;
  crossfadeSeconds: number;
  trackEndAlreadyTriggered: boolean;
  resolveTrackByUri: (uri: string) => DeckTrack | null;
};

export type TrackEndTickResult = {
  nextWasPlayingActiveTrack: boolean;
  nextPrevActivePositionMs: number;
  fireHandoff: boolean;
  fireAdvance: boolean;
  setTrackEndTriggered: boolean;
  clearTrackEndTriggered: boolean;
};

export function resolveEffectiveEndDurationMs(input: {
  activeTrackUri: string | null;
  activeDurationMs: number;
  sdkUri: string | null;
  sdkDurationMs: number;
  endDetectionUri: string;
  fallbackDurationMs: number;
}): number {
  if (
    input.activeTrackUri &&
    trackUrisMatch(input.endDetectionUri, input.activeTrackUri) &&
    input.activeDurationMs > 0
  ) {
    return input.activeDurationMs;
  }
  if (input.fallbackDurationMs > 0) {
    return input.fallbackDurationMs;
  }
  if (
    input.sdkUri &&
    trackUrisMatch(input.sdkUri, input.endDetectionUri) &&
    input.sdkDurationMs > 0
  ) {
    return input.sdkDurationMs;
  }
  return 0;
}

export function resolvePositionMsForEndDetection(input: {
  activeTrackUri: string | null;
  sdkUri: string | null;
  clockPositionMs: number;
  sdkPositionMs: number;
}): number {
  if (
    input.activeTrackUri &&
    input.sdkUri &&
    trackUrisMatch(input.sdkUri, input.activeTrackUri)
  ) {
    return Math.max(input.clockPositionMs, input.sdkPositionMs);
  }
  return input.clockPositionMs;
}

/** Position for natural-end when SDK may still be on the finishing track. */
export function resolvePositionForNaturalEnd(input: {
  sdkUri: string | null;
  activeTrackUri: string | null;
  clockPositionMs: number;
  sdkPositionMs: number;
}): number {
  if (!input.sdkUri) {
    return resolvePositionMsForEndDetection(input);
  }
  if (
    input.activeTrackUri &&
    trackUrisMatch(input.sdkUri, input.activeTrackUri)
  ) {
    return Math.max(input.clockPositionMs, input.sdkPositionMs);
  }
  return input.sdkPositionMs;
}

function durationForUri(
  uri: string,
  input: TrackEndTickInput,
  fallbackDurationMs: number
): number {
  if (
    input.activeTrackUri &&
    trackUrisMatch(uri, input.activeTrackUri) &&
    input.activeDurationMs > 0
  ) {
    return input.activeDurationMs;
  }
  const matched = input.resolveTrackByUri(uri);
  if (matched?.durationMs && matched.durationMs > 0) {
    return matched.durationMs;
  }
  if (
    input.sdkUri &&
    trackUrisMatch(uri, input.sdkUri) &&
    input.sdkDurationMs > 0
  ) {
    return input.sdkDurationMs;
  }
  return fallbackDurationMs;
}

export function evaluateTrackEndTick(
  input: TrackEndTickInput
): TrackEndTickResult {
  const idle = (
    nextWasPlaying: boolean,
    prevPos: number
  ): TrackEndTickResult => ({
    nextWasPlayingActiveTrack: nextWasPlaying,
    nextPrevActivePositionMs: prevPos,
    fireHandoff: false,
    fireAdvance: false,
    setTrackEndTriggered: false,
    clearTrackEndTriggered: false,
  });

  if (input.handoffInProgress) {
    return idle(input.sdkIsPlaying, input.prevActivePositionMs);
  }

  const activeDeckTrackUri = input.activeDeckTrackUri;
  const urisAligned =
    Boolean(input.sdkUri && activeDeckTrackUri) &&
    trackUrisMatch(input.sdkUri, activeDeckTrackUri);

  const handoffEnabled =
    input.secondDeckEnabled && input.handoffToOtherDeckAfterSong;
  const fadeMs = crossfadeSecondsToMs(input.crossfadeSeconds);
  const endThresholdMs = fadeMs > 0 ? fadeMs : 500;

  let nearEndWhilePlaying = false;
  let alignedPositionMs = input.prevActivePositionMs;
  let alignedEndDurationMs = 0;

  if (urisAligned && input.sdkIsPlaying) {
    const endDetectionUri = input.sdkUri ?? input.activeTrackUri;
    if (endDetectionUri) {
      let fallbackDurationMs = input.activeDurationMs;
      if (
        input.activeTrackUri &&
        !trackUrisMatch(endDetectionUri, input.activeTrackUri)
      ) {
        const matched = input.resolveTrackByUri(endDetectionUri);
        fallbackDurationMs = matched?.durationMs ?? input.activeDurationMs;
      }
      alignedEndDurationMs = resolveEffectiveEndDurationMs({
        activeTrackUri: input.activeTrackUri,
        activeDurationMs: input.activeDurationMs,
        sdkUri: input.sdkUri,
        sdkDurationMs: input.sdkDurationMs,
        endDetectionUri,
        fallbackDurationMs,
      });
      alignedPositionMs = resolvePositionMsForEndDetection({
        activeTrackUri: input.activeTrackUri,
        sdkUri: input.sdkUri,
        clockPositionMs: input.clockPositionMs,
        sdkPositionMs: input.sdkPositionMs,
      });
      if (alignedEndDurationMs > 0) {
        nearEndWhilePlaying =
          fadeMs > 0
            ? isNearTrackEnd(
                alignedPositionMs,
                alignedEndDurationMs,
                fadeMs
              )
            : alignedPositionMs >= alignedEndDurationMs - endThresholdMs;
      }
    }
  }

  let endedNaturally = false;
  let naturalPositionMs = alignedPositionMs;
  let naturalEndDurationMs = alignedEndDurationMs;

  if (input.wasPlayingActiveTrack && !input.sdkIsPlaying && input.sdkUri) {
    naturalEndDurationMs = durationForUri(
      input.sdkUri,
      input,
      input.activeDurationMs
    );
    naturalPositionMs = resolvePositionForNaturalEnd({
      sdkUri: input.sdkUri,
      activeTrackUri: input.activeTrackUri,
      clockPositionMs: input.clockPositionMs,
      sdkPositionMs: input.sdkPositionMs,
    });
    if (naturalEndDurationMs > 0) {
      endedNaturally =
        naturalPositionMs >= naturalEndDurationMs - endThresholdMs ||
        input.prevActivePositionMs >= naturalEndDurationMs - endThresholdMs;
    }
  }

  const positionForClear = urisAligned
    ? alignedPositionMs
    : naturalPositionMs;
  const endForClear = urisAligned ? alignedEndDurationMs : naturalEndDurationMs;
  const clearTrackEndTriggered =
    endForClear > 0 &&
    positionForClear < endForClear - Math.max(endThresholdMs, 2000);

  const attemptHandoff = shouldAttemptHandoffAtEnd({
    handoffEnabled,
    endedNaturally,
  });
  const attemptAdvance = shouldTriggerNormalTrackEnd({
    handoffEnabled,
    nearEndWhilePlaying,
    endedNaturally,
  });

  const shouldFire =
    (attemptHandoff || attemptAdvance) && !input.trackEndAlreadyTriggered;

  const nextPrev = urisAligned
    ? alignedPositionMs
    : input.sdkIsPlaying
      ? naturalPositionMs
      : naturalPositionMs;

  return {
    nextWasPlayingActiveTrack: input.sdkIsPlaying,
    nextPrevActivePositionMs: nextPrev,
    fireHandoff: shouldFire && attemptHandoff,
    fireAdvance: shouldFire && attemptAdvance,
    setTrackEndTriggered: shouldFire,
    clearTrackEndTriggered,
  };
}
