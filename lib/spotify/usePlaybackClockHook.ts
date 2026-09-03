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
  const [isRunning, setIsRunning] = useState(false);
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
    (positionMs: number, playing = sdkIsPlaying) => {
      clockRef.current = syncClockFromSdk(
        clockRef.current,
        positionMs,
        playing,
        Date.now()
      );
      setIsRunning(playing);
      bump();
    },
    [bump, sdkIsPlaying]
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
      clockRef.current = pauseClock(clockRef.current, Date.now());
      setIsRunning(false);
      bump();
    }
    prevSdkPlayingRef.current = sdkIsPlaying;
  }, [sdkIsPlaying, isRunning, bump]);

  useEffect(() => {
    if (!isRunning) return;
    let frameId = 0;
    const loop = () => {
      bump();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
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
