"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeDisplayPositionMs,
  createInitialClockState,
  pauseClock,
  resetClock,
  resumeClock,
  syncClockFromSdk,
  type PlaybackClockState,
} from "@/lib/spotify/usePlaybackClock";
import { shouldReRenderAfterClockSync } from "@/lib/spotify/playbackClockSync";

/** Display refresh while the clock is running (matches deck track-end poll). */
const CLOCK_DISPLAY_TICK_MS = 250;

export type UsePlaybackClockOptions = {
  /** When false, auto-pause the clock (e.g. SDK reports playback stopped). */
  isPlaying?: boolean;
  durationMs: number;
  trackUri: string | null;
};

export type UsePlaybackClockReturn = {
  displayPositionMs: number;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  syncFromSdk: (positionMs: number, playing?: boolean) => void;
};

export function usePlaybackClock(
  options: UsePlaybackClockOptions
): UsePlaybackClockReturn {
  const { isPlaying: sdkIsPlaying = false, durationMs, trackUri } = options;
  const clockRef = useRef<PlaybackClockState>(createInitialClockState());
  const prevTrackUriRef = useRef<string | null>(null);
  const prevSdkPlayingRef = useRef(false);
  const sdkIsPlayingRef = useRef(sdkIsPlaying);
  sdkIsPlayingRef.current = sdkIsPlaying;
  const durationMsRef = useRef(durationMs);
  durationMsRef.current = durationMs;
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  isRunningRef.current = isRunning;
  const [, setTick] = useState(0);

  const bump = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const reset = useCallback(() => {
    clockRef.current = resetClock(Date.now());
    setIsRunning(true);
    bump();
  }, [bump]);

  const pause = useCallback(() => {
    clockRef.current = pauseClock(clockRef.current, Date.now());
    setIsRunning(false);
    bump();
  }, [bump]);

  const resume = useCallback(() => {
    clockRef.current = resumeClock(clockRef.current, Date.now());
    setIsRunning(true);
    bump();
  }, [bump]);

  const syncFromSdk = useCallback(
    (positionMs: number, playing = sdkIsPlayingRef.current) => {
      const before = clockRef.current;
      const next = syncClockFromSdk(before, positionMs, playing, Date.now());
      clockRef.current = next;
      if (
        !shouldReRenderAfterClockSync(
          before,
          next,
          playing,
          isRunningRef.current
        )
      ) {
        return;
      }
      setIsRunning(playing);
      bump();
    },
    [bump]
  );

  useEffect(() => {
    if (trackUri === prevTrackUriRef.current) return;
    prevTrackUriRef.current = trackUri;
    if (!trackUri) {
      clockRef.current = createInitialClockState();
      setIsRunning(false);
    } else {
      clockRef.current = createInitialClockState();
    }
    bump();
  }, [trackUri, bump]);

  // Pause the clock when SDK stops unexpectedly (device transfer), not at track end.
  useEffect(() => {
    if (prevSdkPlayingRef.current && !sdkIsPlaying && isRunning) {
      const nowMs = Date.now();
      const displayMs = computeDisplayPositionMs({
        offsetMs: clockRef.current.offsetMs,
        startedAtMs: clockRef.current.startedAtMs,
        isPlaying: true,
        durationMs: durationMsRef.current,
        nowMs,
      });
      const pinnedAtEnd =
        durationMsRef.current > 0 &&
        displayMs >= durationMsRef.current - 1;
      if (!pinnedAtEnd) {
        clockRef.current = pauseClock(clockRef.current, nowMs);
        setIsRunning(false);
        bump();
      }
    }
    prevSdkPlayingRef.current = sdkIsPlaying;
  }, [sdkIsPlaying, isRunning, bump]);

  useEffect(() => {
    if (!isRunning) return;
    const intervalId = window.setInterval(() => {
      bump();
    }, CLOCK_DISPLAY_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [isRunning, bump]);

  const displayPositionMs = computeDisplayPositionMs({
    offsetMs: clockRef.current.offsetMs,
    startedAtMs: clockRef.current.startedAtMs,
    isPlaying: isRunning,
    durationMs,
    nowMs: Date.now(),
  });

  return {
    displayPositionMs,
    reset,
    pause,
    resume,
    syncFromSdk,
  };
}
