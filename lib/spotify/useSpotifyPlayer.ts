"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetchWithRetry } from "@/lib/clientAuth";
import {
  parseSpotifyApiError,
  SpotifyPlayerErrorException,
  type SpotifyPlayerError,
} from "@/lib/spotify/spotifyApiErrors";
import {
  canUseWebApi,
  shouldDeferReconnect,
} from "@/lib/spotify/spotifyPlayerLifecycle";
import { SpotifyPlayerTokenManager } from "@/lib/spotify/spotifyPlayerToken";
import type { SpotifyPlaybackState, SpotifyPlayerInstance } from "@/lib/spotify/spotifySdkTypes";

const SPOTIFY_SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const DEVICE_READY_TIMEOUT_MS = 15_000;

let sdkLoadPromise: Promise<void> | null = null;

function loadSpotifySdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Spotify SDK requires a browser"));
  }
  if (window.Spotify?.Player) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${SPOTIFY_SDK_URL}"]`
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = SPOTIFY_SDK_URL;
      script.async = true;
      document.body.appendChild(script);
    }

    const prior = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      prior?.();
      resolve();
    };

    setTimeout(() => {
      if (!window.Spotify?.Player) {
        reject(new Error("Spotify Web Playback SDK failed to load"));
      }
    }, 15000);
  });

  return sdkLoadPromise;
}

export type SpotifyPlayerStatus =
  | "idle"
  | "loading_sdk"
  | "connecting"
  | "ready"
  | "error";

export type SpotifyPlayerMode = "host" | "controller";

export type ControllerPlaybackSnapshot = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
};

export type SpotifyPlayerNotice = {
  severity: "warning" | "error";
  error: SpotifyPlayerError;
};

export type UseSpotifyPlayerOptions = {
  authToken: string | null;
  enabled: boolean;
  mode?: SpotifyPlayerMode;
  controllerSnapshot?: ControllerPlaybackSnapshot | null;
  onPlaybackError?: (message: string) => void;
  onPlaybackInterrupted?: (message: string) => void;
  onPlayerNotice?: (notice: SpotifyPlayerNotice | null) => void;
};

export type UseSpotifyPlayerReturn = {
  status: SpotifyPlayerStatus;
  error: string | null;
  notice: SpotifyPlayerNotice | null;
  deviceId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
  volume: number;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => void;
  primeTrack: (uri: string) => Promise<void>;
  playUri: (uri: string, positionMs?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => void;
  dismissNotice: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MappedPlayerState = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
};

function mapPlayerState(state: SpotifyPlaybackState | null): MappedPlayerState | null {
  if (!state) return null;
  const current = state.track_window.current_track;
  return {
    isPlaying: !state.paused,
    positionMs: state.position,
    durationMs: current?.duration_ms ?? 0,
    currentTrackUri: current?.uri ?? null,
  };
}

async function playerApi(
  path: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await authedFetchWithRetry(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const parsed = parseSpotifyApiError(
      (body as { error?: unknown }).error ?? res.statusText,
      res.status
    );
    throw new SpotifyPlayerErrorException(parsed);
  }
}

export function useSpotifyPlayer(
  options: UseSpotifyPlayerOptions
): UseSpotifyPlayerReturn {
  const {
    authToken,
    enabled,
    mode = "host",
    controllerSnapshot = null,
    onPlaybackError,
    onPlaybackInterrupted,
    onPlayerNotice,
  } = options;
  const isController = mode === "controller";
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const deviceIdRef = useRef<string | null>(null);
  const statusRef = useRef<SpotifyPlayerStatus>("idle");
  const isPlayingRef = useRef(false);
  const pendingReconnectRef = useRef(false);
  const pendingDeviceRefreshRef = useRef(false);
  const reconnectInFlightRef = useRef<Promise<void> | null>(null);
  const deviceReadyWaitersRef = useRef<Array<(deviceId: string) => void>>([]);
  const tokenManagerRef = useRef<SpotifyPlayerTokenManager | null>(null);

  const onPlaybackErrorRef = useRef(onPlaybackError);
  onPlaybackErrorRef.current = onPlaybackError;
  const onPlayerNoticeRef = useRef(onPlayerNotice);
  onPlayerNoticeRef.current = onPlayerNotice;

  const [status, setStatus] = useState<SpotifyPlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SpotifyPlayerNotice | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTrackUri, setCurrentTrackUri] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1);

  const updateStatus = useCallback((next: SpotifyPlayerStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const emitNotice = useCallback((next: SpotifyPlayerNotice | null) => {
    setNotice(next);
    onPlayerNoticeRef.current?.(next);
  }, []);

  const dismissNotice = useCallback(() => {
    emitNotice(null);
  }, [emitNotice]);

  const clearDeviceRefs = useCallback(() => {
    deviceIdRef.current = null;
    setDeviceId(null);
  }, []);

  const assignDeviceId = useCallback((nextDeviceId: string) => {
    deviceIdRef.current = nextDeviceId;
    setDeviceId(nextDeviceId);
    pendingReconnectRef.current = false;
    pendingDeviceRefreshRef.current = false;
    const waiters = deviceReadyWaitersRef.current.splice(0);
    for (const resolve of waiters) {
      resolve(nextDeviceId);
    }
  }, []);

  const waitForDeviceReady = useCallback((): Promise<string> => {
    if (deviceIdRef.current) {
      return Promise.resolve(deviceIdRef.current);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        deviceReadyWaitersRef.current = deviceReadyWaitersRef.current.filter(
          (fn) => fn !== resolve
        );
        reject(new Error("Timed out waiting for Spotify device"));
      }, DEVICE_READY_TIMEOUT_MS);
      deviceReadyWaitersRef.current.push((id) => {
        clearTimeout(timer);
        resolve(id);
      });
    });
  }, []);

  const getTokenManager = useCallback(() => {
    if (!tokenManagerRef.current) {
      tokenManagerRef.current = new SpotifyPlayerTokenManager({
        onPersistentFailure: (structuredError) => {
          clearDeviceRefs();
          pendingReconnectRef.current = true;
          emitNotice({ severity: "warning", error: structuredError });
        },
        onRefreshSuccess: () => {
          emitNotice(null);
          if (!shouldDeferReconnect(isPlayingRef.current)) {
            pendingDeviceRefreshRef.current = true;
          } else {
            pendingDeviceRefreshRef.current = true;
          }
        },
      });
    }
    return tokenManagerRef.current;
  }, [clearDeviceRefs, emitNotice]);

  const handleAuthFailure = useCallback(
    (structuredError: SpotifyPlayerError) => {
      clearDeviceRefs();
      pendingReconnectRef.current = true;
      emitNotice({ severity: "warning", error: structuredError });
      if (!isPlayingRef.current) {
        setError(structuredError.message);
        updateStatus("error");
      }
    },
    [clearDeviceRefs, emitNotice, updateStatus]
  );

  const reconnectDeviceInternal = useCallback(async () => {
    if (reconnectInFlightRef.current) {
      await reconnectInFlightRef.current;
      return;
    }

    const player = playerRef.current;
    if (!player || !authTokenRef.current) {
      throw new Error("Player is not connected");
    }

    reconnectInFlightRef.current = (async () => {
      updateStatus("connecting");
      const connected = await player.connect();
      if (!connected) {
        throw new Error("Failed to reconnect Spotify player");
      }
      await waitForDeviceReady();
      updateStatus("ready");
      setError(null);
      emitNotice(null);
      pendingReconnectRef.current = false;
      pendingDeviceRefreshRef.current = false;
    })();

    try {
      await reconnectInFlightRef.current;
    } finally {
      reconnectInFlightRef.current = null;
    }
  }, [emitNotice, updateStatus, waitForDeviceReady]);

  const maybeRefreshDevice = useCallback(async () => {
    if (!pendingDeviceRefreshRef.current && !pendingReconnectRef.current) {
      return;
    }
    if (shouldDeferReconnect(isPlayingRef.current)) {
      return;
    }
    await reconnectDeviceInternal();
  }, [reconnectDeviceInternal]);

  const ensureReadyForCommand = useCallback(
    async (options?: { allowSdkOnly?: boolean }) => {
      if (!authTokenRef.current) {
        throw new Error("Sign in required");
      }

      const tokenResult = await getTokenManager().getToken();
      if (!tokenResult.ok) {
        handleAuthFailure(tokenResult.structuredError);
        const cached = getTokenManager().getCachedToken();
        if (!cached && !options?.allowSdkOnly) {
          throw new SpotifyPlayerErrorException(tokenResult.structuredError);
        }
      }

      if (shouldDeferReconnect(isPlayingRef.current)) {
        return;
      }

      if (!canUseWebApi(deviceIdRef.current, pendingReconnectRef.current)) {
        await reconnectDeviceInternal();
      } else if (pendingDeviceRefreshRef.current) {
        await reconnectDeviceInternal();
      }
    },
    [getTokenManager, handleAuthFailure, reconnectDeviceInternal]
  );

  const handlePlayerApiError = useCallback(
    async (err: unknown) => {
      if (!(err instanceof SpotifyPlayerErrorException)) {
        throw err;
      }
      if (err.spotifyError.code === "DEVICE_NOT_FOUND") {
        clearDeviceRefs();
        pendingReconnectRef.current = true;
        emitNotice({ severity: "warning", error: err.spotifyError });
        if (!shouldDeferReconnect(isPlayingRef.current)) {
          await reconnectDeviceInternal();
        }
        throw err;
      }
      onPlaybackErrorRef.current?.(err.spotifyError.message);
      throw err;
    },
    [clearDeviceRefs, emitNotice, reconnectDeviceInternal]
  );

  const applyMappedState = useCallback((mapped: MappedPlayerState | null) => {
    if (!mapped) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      onPlaybackInterrupted?.(
        "Playback moved to another device — close Spotify on other devices and try again."
      );
      return;
    }
    const wasPlaying = isPlayingRef.current;
    isPlayingRef.current = mapped.isPlaying;
    setIsPlaying(mapped.isPlaying);
    setPositionMs(mapped.positionMs);
    setDurationMs(mapped.durationMs);
    setCurrentTrackUri(mapped.currentTrackUri);

    if (wasPlaying && !mapped.isPlaying) {
      void maybeRefreshDevice();
    }
  }, [maybeRefreshDevice, onPlaybackInterrupted]);

  const syncCurrentState = useCallback(async () => {
    const state = await playerRef.current?.getCurrentState();
    const mapped = mapPlayerState(state as SpotifyPlaybackState | null);
    if (mapped) applyMappedState(mapped);
    return mapped;
  }, [applyMappedState]);

  const disconnect = useCallback(() => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    tokenManagerRef.current?.clearCache();
    tokenManagerRef.current = null;
    clearDeviceRefs();
    pendingReconnectRef.current = false;
    pendingDeviceRefreshRef.current = false;
    isPlayingRef.current = false;
    updateStatus("idle");
    emitNotice(null);
  }, [clearDeviceRefs, emitNotice, updateStatus]);

  const setupPlayerListeners = useCallback(
    (player: SpotifyPlayerInstance) => {
      player.addListener("ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        assignDeviceId(device_id);
        updateStatus("ready");
        setError(null);
        emitNotice(null);
      });

      player.addListener("not_ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        assignDeviceId(device_id);
        if (!isPlayingRef.current) {
          updateStatus("connecting");
        }
      });

      player.addListener("player_state_changed", (state) => {
        applyMappedState(
          mapPlayerState(state as SpotifyPlaybackState | null)
        );
      });

      player.addListener("initialization_error", (payload) => {
        const { message } = payload as { message: string };
        handleAuthFailure(parseSpotifyApiError(message));
      });

      player.addListener("authentication_error", (payload) => {
        const { message } = payload as { message: string };
        handleAuthFailure(parseSpotifyApiError(message));
      });

      player.addListener("account_error", () => {
        const structured = parseSpotifyApiError("Spotify Premium is required");
        handleAuthFailure(structured);
      });

      player.addListener("playback_error", (payload) => {
        const { message } = payload as { message: string };
        onPlaybackErrorRef.current?.(
          parseSpotifyApiError(message).message
        );
      });
    },
    [applyMappedState, assignDeviceId, emitNotice, handleAuthFailure, updateStatus]
  );

  const createOAuthTokenHandler = useCallback(() => {
    return (cb: (token: string) => void) => {
      void (async () => {
        if (!authTokenRef.current) {
          handleAuthFailure(
            parseSpotifyApiError("Session expired — sign in again", 401)
          );
          cb("");
          return;
        }

        const manager = getTokenManager();
        const hadValidCache = Boolean(manager.getCachedToken());
        const result = await manager.getToken();
        if (result.ok) {
          cb(result.token.accessToken);
          if (!hadValidCache) {
            pendingDeviceRefreshRef.current = true;
            void maybeRefreshDevice();
          }
          return;
        }

        const cached = getTokenManager().getCachedToken();
        clearDeviceRefs();
        pendingReconnectRef.current = true;
        emitNotice({ severity: "warning", error: result.structuredError });

        if (cached) {
          cb(cached);
          return;
        }

        cb("");
      })();
    };
  }, [
    clearDeviceRefs,
    emitNotice,
    getTokenManager,
    handleAuthFailure,
    maybeRefreshDevice,
  ]);

  const connect = useCallback(async () => {
    if (!authTokenRef.current) {
      setError("Sign in required");
      updateStatus("error");
      return;
    }

    setError(null);
    emitNotice(null);
    updateStatus("loading_sdk");

    try {
      await loadSpotifySdk();
      if (!window.Spotify?.Player) {
        throw new Error("Spotify Web Playback SDK unavailable");
      }

      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }

      updateStatus("connecting");

      const tokenResult = await getTokenManager().refresh();
      if (!tokenResult.ok) {
        handleAuthFailure(tokenResult.structuredError);
        if (!getTokenManager().getCachedToken()) {
          throw new SpotifyPlayerErrorException(tokenResult.structuredError);
        }
      }

      const player = new window.Spotify.Player({
        name: "CCS DJ Deck",
        volume,
        getOAuthToken: createOAuthTokenHandler(),
      });

      setupPlayerListeners(player);
      playerRef.current = player;
      await player.activateElement();
      const connected = await player.connect();
      if (!connected) {
        throw new Error("Failed to connect Spotify player");
      }

      await waitForDeviceReady();
      getTokenManager().scheduleProactiveRefresh();
    } catch (err) {
      const message =
        err instanceof SpotifyPlayerErrorException
          ? err.spotifyError.message
          : err instanceof Error
            ? err.message
            : "Failed to connect player";
      setError(message);
      updateStatus("error");
    }
  }, [
    createOAuthTokenHandler,
    emitNotice,
    getTokenManager,
    handleAuthFailure,
    setupPlayerListeners,
    updateStatus,
    volume,
    waitForDeviceReady,
  ]);

  const reconnect = useCallback(async () => {
    dismissNotice();
    pendingReconnectRef.current = false;
    pendingDeviceRefreshRef.current = false;

    if (shouldDeferReconnect(isPlayingRef.current)) {
      pendingDeviceRefreshRef.current = true;
      return;
    }

    if (playerRef.current) {
      await reconnectDeviceInternal();
      await getTokenManager().refresh();
      return;
    }

    await connect();
  }, [
    connect,
    dismissNotice,
    getTokenManager,
    reconnectDeviceInternal,
  ]);

  const executePlay = useCallback(
    async (uri: string, positionMs?: number) => {
      await ensureReadyForCommand();
      const id = deviceIdRef.current;
      if (!id) {
        throw new Error("Player is not ready");
      }
      if (statusRef.current !== "ready" && statusRef.current !== "connecting") {
        throw new Error("Player is not ready");
      }

      await playerRef.current?.activateElement();
      const payload: { uri: string; deviceId: string; positionMs?: number } = {
        uri,
        deviceId: id,
      };
      if (positionMs != null && positionMs > 0) {
        payload.positionMs = positionMs;
      }
      await playerApi("/api/spotify/player/play", payload);
    },
    [ensureReadyForCommand]
  );

  const playUri = useCallback(
    async (uri: string, positionMs?: number) => {
      try {
        try {
          await executePlay(uri, positionMs);
        } catch (err) {
          if (
            err instanceof SpotifyPlayerErrorException &&
            err.spotifyError.code === "DEVICE_NOT_FOUND" &&
            !shouldDeferReconnect(isPlayingRef.current)
          ) {
            await handlePlayerApiError(err);
            await executePlay(uri, positionMs);
          } else {
            throw err;
          }
        }

        let mapped = await syncCurrentState();
        if (!mapped) {
          await sleep(500);
          mapped = await syncCurrentState();
        }
        if (!mapped?.isPlaying) {
          onPlaybackErrorRef.current?.(
            "Could not start on this device — close other Spotify apps and try again."
          );
        }
      } catch (err) {
        await handlePlayerApiError(err);
      }
    },
    [executePlay, handlePlayerApiError, syncCurrentState]
  );

  const pause = useCallback(async () => {
    try {
      if (
        !canUseWebApi(deviceIdRef.current, pendingReconnectRef.current) &&
        isPlayingRef.current
      ) {
        await playerRef.current?.pause();
        await syncCurrentState();
        return;
      }

      await ensureReadyForCommand({ allowSdkOnly: true });
      const id = deviceIdRef.current;
      if (!id) {
        await playerRef.current?.pause();
        await syncCurrentState();
        return;
      }
      await playerApi("/api/spotify/player/pause", { deviceId: id });
      await playerRef.current?.pause();
      await syncCurrentState();
    } catch (err) {
      await handlePlayerApiError(err);
    }
  }, [ensureReadyForCommand, handlePlayerApiError, syncCurrentState]);

  const primeTrack = useCallback(
    async (uri: string) => {
      try {
        await ensureReadyForCommand();
        const id = deviceIdRef.current;
        if (!id || statusRef.current !== "ready") return;

        await playerRef.current?.activateElement();
        await playerApi("/api/spotify/player/play", { uri, deviceId: id });

        let mapped = await syncCurrentState();
        if (!mapped) {
          await sleep(500);
          mapped = await syncCurrentState();
        }

        if (mapped?.isPlaying) {
          await playerRef.current?.pause();
          await syncCurrentState();
        }
      } catch (err) {
        await handlePlayerApiError(err);
      }
    },
    [ensureReadyForCommand, handlePlayerApiError, syncCurrentState]
  );

  const resume = useCallback(async () => {
    await playerRef.current?.activateElement();
    await playerRef.current?.resume();
    await syncCurrentState();
  }, [syncCurrentState]);

  const seek = useCallback(
    async (positionMs: number) => {
      try {
        if (
          !canUseWebApi(deviceIdRef.current, pendingReconnectRef.current) &&
          isPlayingRef.current
        ) {
          return;
        }

        await ensureReadyForCommand({ allowSdkOnly: true });
        const id = deviceIdRef.current;
        if (!id) return;

        await playerApi("/api/spotify/player/seek", {
          deviceId: id,
          positionMs,
        });
        await syncCurrentState();
      } catch (err) {
        await handlePlayerApiError(err);
      }
    },
    [ensureReadyForCommand, handlePlayerApiError, syncCurrentState]
  );

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolumeState(clamped);
    void playerRef.current?.setVolume(clamped);
  }, []);

  useEffect(() => {
    if (!enabled || isController) {
      disconnect();
    }
  }, [enabled, disconnect, isController]);

  useEffect(() => {
    if (!isController || !controllerSnapshot) return;
    setIsPlaying(controllerSnapshot.isPlaying);
    isPlayingRef.current = controllerSnapshot.isPlaying;
    setPositionMs(controllerSnapshot.positionMs);
    setDurationMs(controllerSnapshot.durationMs);
    setCurrentTrackUri(controllerSnapshot.currentTrackUri);
    updateStatus("ready");
  }, [controllerSnapshot, isController, updateStatus]);

  useEffect(() => {
    return () => {
      tokenManagerRef.current?.clearCache();
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  const controllerConnect = useCallback(async () => {
    updateStatus("ready");
  }, [updateStatus]);

  const controllerNoop = useCallback(async () => {
    /* controller mode routes playback through session commands */
  }, []);

  const controllerSetVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolumeState(clamped);
  }, []);

  if (isController) {
    return {
      status: (enabled ? "ready" : "idle") as SpotifyPlayerStatus,
      error: null,
      notice: null,
      deviceId: null,
      isPlaying: controllerSnapshot?.isPlaying ?? false,
      positionMs: controllerSnapshot?.positionMs ?? 0,
      durationMs: controllerSnapshot?.durationMs ?? 0,
      currentTrackUri: controllerSnapshot?.currentTrackUri ?? null,
      volume,
      connect: controllerConnect,
      reconnect: controllerNoop,
      disconnect,
      primeTrack: controllerNoop,
      playUri: controllerNoop,
      pause: controllerNoop,
      resume: controllerNoop,
      seek: controllerNoop,
      setVolume: controllerSetVolume,
      dismissNotice: () => {},
    };
  }

  return {
    status,
    error,
    notice,
    deviceId,
    isPlaying,
    positionMs,
    durationMs,
    currentTrackUri,
    volume,
    connect,
    reconnect,
    disconnect,
    primeTrack,
    playUri,
    pause,
    resume,
    seek,
    setVolume,
    dismissNotice,
  };
}
