"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetchWithRetry } from "@/lib/clientAuth";
import { configureMusicKit } from "@/lib/appleMusic/musicKitLoader";
import {
  isMusicKitPlaybackTerminalState,
  readMusicKitPlaybackSnapshot,
} from "@/lib/appleMusic/readPlaybackSnapshot";
import {
  ensurePlaybackIdleBeforeNewQueue,
  ensureReadyForResume,
} from "@/lib/appleMusic/playbackTransition";
import type { MusicKitInstance } from "@/lib/appleMusic/musicKitTypes";

const DEVICE_READY_TIMEOUT_MS = 15_000;

export type MusicKitPlayerStatus =
  | "idle"
  | "loading_sdk"
  | "connecting"
  | "ready"
  | "error";

export type MusicKitPlayerMode = "host" | "controller";

export type ControllerPlaybackSnapshot = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
};

export type MusicKitPlayerNotice = {
  severity: "warning" | "error";
  message: string;
};

export type UseMusicKitPlayerOptions = {
  authToken: string | null;
  enabled: boolean;
  mode?: MusicKitPlayerMode;
  controllerSnapshot?: ControllerPlaybackSnapshot | null;
  onPlaybackError?: (message: string) => void;
  onPlaybackInterrupted?: (message: string) => void;
  onPlayerNotice?: (notice: MusicKitPlayerNotice | null) => void;
  onPlaybackCompleted?: () => void;
};

export type UseMusicKitPlayerReturn = {
  status: MusicKitPlayerStatus;
  error: string | null;
  notice: MusicKitPlayerNotice | null;
  deviceId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
  currentTrackIsrc: string | null;
  volume: number;
  isAuthorized: boolean;
  musicUserToken: string | null;
  storefrontId: string | null;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => void;
  authorize: () => Promise<void>;
  primeTrack: (uri: string) => Promise<void>;
  playUri: (uri: string, positionMs?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => void;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  dismissNotice: () => void;
  syncState: () => Promise<{
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    currentTrackUri: string | null;
  } | null>;
};

function uriToSongId(uri: string): string {
  if (uri.startsWith("appleMusic:songs:")) {
    return uri.slice("appleMusic:songs:".length);
  }
  return uri.trim();
}

export function useMusicKitPlayer(
  options: UseMusicKitPlayerOptions
): UseMusicKitPlayerReturn {
  const {
    authToken,
    enabled,
    mode = "host",
    controllerSnapshot = null,
    onPlaybackError,
    onPlaybackInterrupted,
    onPlayerNotice,
    onPlaybackCompleted,
  } = options;
  const isController = mode === "controller";

  const musicRef = useRef<MusicKitInstance | null>(null);
  const onPlaybackCompletedRef = useRef(onPlaybackCompleted);
  onPlaybackCompletedRef.current = onPlaybackCompleted;
  const wasPlayingRef = useRef(false);
  const [status, setStatus] = useState<MusicKitPlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<MusicKitPlayerNotice | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [musicUserToken, setMusicUserToken] = useState<string | null>(null);
  const [storefrontId, setStorefrontId] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1);
  const [playback, setPlayback] = useState({
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    currentTrackUri: null as string | null,
    currentTrackIsrc: null as string | null,
  });

  const syncFromMusic = useCallback(() => {
    const music = musicRef.current;
    if (!music || isController) return;
    const snapshot = readMusicKitPlaybackSnapshot(music);
    setPlayback(snapshot);
    wasPlayingRef.current = snapshot.isPlaying;
    setVolumeState(music.volume);
    setIsAuthorized(
      Boolean(music.isAuthorized && music.musicUserToken?.trim())
    );
    setMusicUserToken(music.musicUserToken?.trim() || null);
    setStorefrontId(music.storefrontId?.trim() || null);
  }, [isController]);

  const handlePlaybackStateDidChange = useCallback(() => {
    const music = musicRef.current;
    if (!music || isController) return;
    const hadBeenPlaying = wasPlayingRef.current;
    const terminal = isMusicKitPlaybackTerminalState(
      music.currentPlaybackState
    );
    syncFromMusic();
    wasPlayingRef.current = music.isPlaying;
    if (terminal && hadBeenPlaying) {
      onPlaybackCompletedRef.current?.();
    }
  }, [isController, syncFromMusic]);

  useEffect(() => {
    if (!isController || !controllerSnapshot) return;
    setPlayback({
      isPlaying: controllerSnapshot.isPlaying,
      positionMs: controllerSnapshot.positionMs,
      durationMs: controllerSnapshot.durationMs,
      currentTrackUri: controllerSnapshot.currentTrackUri,
      currentTrackIsrc: null,
    });
  }, [isController, controllerSnapshot]);

  useEffect(() => {
    if (isController || !enabled) return;
    const music = musicRef.current;
    if (!music) return;

    const onTimeChange = () => {
      syncFromMusic();
      if (musicRef.current) {
        wasPlayingRef.current = musicRef.current.isPlaying;
      }
    };
    const onItemChange = () => syncFromMusic();
    const onAuthChange = () => syncFromMusic();
    music.addEventListener("playbackStateDidChange", handlePlaybackStateDidChange);
    music.addEventListener("mediaItemDidChange", onItemChange);
    music.addEventListener("playbackTimeDidChange", onTimeChange);
    music.addEventListener("authorizationStatusDidChange", onAuthChange);

    return () => {
      music.removeEventListener(
        "playbackStateDidChange",
        handlePlaybackStateDidChange
      );
      music.removeEventListener("mediaItemDidChange", onItemChange);
      music.removeEventListener("playbackTimeDidChange", onTimeChange);
      music.removeEventListener("authorizationStatusDidChange", onAuthChange);
    };
  }, [enabled, handlePlaybackStateDidChange, isController, syncFromMusic, status]);

  const ensureMusicKit = useCallback(async (): Promise<MusicKitInstance> => {
    if (!authToken) {
      throw new Error("Sign in required");
    }
    setStatus("loading_sdk");
    const res = await authedFetchWithRetry("/api/apple-music/developer-token");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (body as { error?: string }).error || "Failed to load developer token"
      );
    }
    const developerToken = (body as { developerToken?: string }).developerToken;
    if (!developerToken) {
      throw new Error("Missing developer token");
    }
    setStatus("connecting");
    const music = await configureMusicKit(developerToken);
    musicRef.current = music;
    syncFromMusic();
    return music;
  }, [authToken, syncFromMusic]);

  const connect = useCallback(async () => {
    if (isController) {
      setStatus("ready");
      return;
    }
    try {
      setError(null);
      await ensureMusicKit();
      syncFromMusic();
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "MusicKit connect failed";
      setError(message);
      setStatus("error");
      onPlayerNotice?.({ severity: "error", message });
    }
  }, [ensureMusicKit, isController, onPlayerNotice, syncFromMusic]);

  const authorize = useCallback(async () => {
    try {
      const music = musicRef.current ?? (await ensureMusicKit());
      setStatus("connecting");
      await music.authorize();
      syncFromMusic();
      setStatus("ready");
      setNotice(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Apple Music authorization failed";
      setError(message);
      setStatus("error");
      onPlayerNotice?.({ severity: "error", message });
    }
  }, [ensureMusicKit, onPlayerNotice, syncFromMusic]);

  const reconnect = useCallback(async () => {
    await connect();
    if (musicRef.current && !musicRef.current.isAuthorized) {
      await authorize();
    }
  }, [authorize, connect]);

  const disconnect = useCallback(() => {
    void musicRef.current?.unauthorize?.();
    musicRef.current = null;
    setStatus("idle");
    setIsAuthorized(false);
    setMusicUserToken(null);
  }, []);

  const playUri = useCallback(
    async (uri: string, positionMs = 0) => {
      if (isController) return;
      try {
        const music = musicRef.current ?? (await ensureMusicKit());
        if (!music.isAuthorized) {
          await music.authorize();
          syncFromMusic();
        }
        await ensurePlaybackIdleBeforeNewQueue(music);
        const songId = uriToSongId(uri);
        await music.setQueue({ song: songId, startWith: 0 });
        if (positionMs > 0) {
          await music.seekToTime(positionMs / 1000);
        }
        await music.play();
        syncFromMusic();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Playback failed";
        onPlaybackError?.(message);
        throw err;
      }
    },
    [ensureMusicKit, isController, onPlaybackError, syncFromMusic]
  );

  const primeTrack = useCallback(
    async (uri: string) => {
      if (isController) return;
      const music = musicRef.current ?? (await ensureMusicKit());
      if (!music.isAuthorized) {
        await music.authorize();
        syncFromMusic();
      }
      const songId = uriToSongId(uri);
      await music.setQueue({ song: songId, startWith: 0 });
      syncFromMusic();
    },
    [ensureMusicKit, isController, syncFromMusic]
  );

  const pause = useCallback(async () => {
    if (isController) return;
    await musicRef.current?.pause();
    syncFromMusic();
  }, [isController, syncFromMusic]);

  const resume = useCallback(async () => {
    if (isController) return;
    const music = musicRef.current;
    if (!music) return;
    if (music.isPlaying) {
      syncFromMusic();
      return;
    }
    await ensureReadyForResume(music);
    await music.play();
    syncFromMusic();
  }, [isController, syncFromMusic]);

  const seek = useCallback(
    async (positionMs: number) => {
      if (isController) return;
      await musicRef.current?.seekToTime(Math.max(0, positionMs / 1000));
      syncFromMusic();
    },
    [isController, syncFromMusic]
  );

  const setVolume = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      setVolumeState(clamped);
      if (musicRef.current) {
        musicRef.current.volume = clamped;
      }
    },
    []
  );

  const skipToNext = useCallback(async () => {
    if (isController) return;
    await musicRef.current?.skipToNextItem();
    syncFromMusic();
  }, [isController, syncFromMusic]);

  const skipToPrevious = useCallback(async () => {
    if (isController) return;
    await musicRef.current?.skipToPreviousItem();
    syncFromMusic();
  }, [isController, syncFromMusic]);

  const syncState = useCallback(async () => {
    const music = musicRef.current;
    if (!music || isController) return null;
    const snapshot = readMusicKitPlaybackSnapshot(music);
    return {
      isPlaying: snapshot.isPlaying,
      positionMs: snapshot.positionMs,
      durationMs: snapshot.durationMs,
      currentTrackUri: snapshot.currentTrackUri,
    };
  }, [isController]);

  useEffect(() => {
    if (!enabled || isController) return;
    let cancelled = false;
    void (async () => {
      try {
        await connect();
        if (cancelled) return;
        const timeout = window.setTimeout(() => {
          if (!cancelled && statusRef.current === "connecting") {
            setError("MusicKit ready timeout");
            setStatus("error");
          }
        }, DEVICE_READY_TIMEOUT_MS);
        return () => window.clearTimeout(timeout);
      } catch {
        // connect sets error state
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial connect when enabled
  }, [enabled, isController]);

  const statusRef = useRef(status);
  statusRef.current = status;

  const dismissNotice = useCallback(() => {
    setNotice(null);
    onPlayerNotice?.(null);
  }, [onPlayerNotice]);

  useEffect(() => {
    if (!onPlaybackInterrupted) return;
    // MusicKit interrupted state surfaced via playbackStateDidChange in syncFromMusic
  }, [onPlaybackInterrupted]);

  return {
    status,
    error,
    notice,
    deviceId: isAuthorized ? "musickit" : null,
    isPlaying: playback.isPlaying,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    currentTrackUri: playback.currentTrackUri,
    currentTrackIsrc: playback.currentTrackIsrc,
    volume,
    isAuthorized,
    musicUserToken,
    storefrontId,
    connect,
    reconnect,
    disconnect,
    authorize,
    primeTrack,
    playUri,
    pause,
    resume,
    seek,
    setVolume,
    skipToNext,
    skipToPrevious,
    dismissNotice,
    syncState,
  };
}
