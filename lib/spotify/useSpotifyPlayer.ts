"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiError,
  authedFetchWithRetry,
} from "@/lib/clientAuth";
import type { SpotifyPlaybackState, SpotifyPlayerInstance } from "@/lib/spotify/spotifySdkTypes";

const SPOTIFY_SDK_URL = "https://sdk.scdn.co/spotify-player.js";

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

export type UseSpotifyPlayerOptions = {
  authToken: string | null;
  enabled: boolean;
  onPlaybackError?: (message: string) => void;
  onPlaybackInterrupted?: (message: string) => void;
};

export type UseSpotifyPlayerReturn = {
  status: SpotifyPlayerStatus;
  error: string | null;
  deviceId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrackUri: string | null;
  volume: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  primeTrack: (uri: string) => Promise<void>;
  playUri: (uri: string, positionMs?: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => void;
};

async function fetchPlayerToken(): Promise<string> {
  const res = await authedFetchWithRetry("/api/spotify/player-token");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body as { error?: string }).error ??
      (await apiError(res));
    if (res.status === 403 && (body as { needsDeckReconnect?: boolean }).needsDeckReconnect) {
      throw new Error(
        "Spotify reconnect required for DJ deck playback scopes"
      );
    }
    throw new Error(message);
  }
  return (body as { accessToken: string }).accessToken;
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
    throw new Error(await apiError(res));
  }
}

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

export function useSpotifyPlayer(
  options: UseSpotifyPlayerOptions
): UseSpotifyPlayerReturn {
  const { authToken, enabled, onPlaybackError, onPlaybackInterrupted } = options;
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const deviceIdRef = useRef<string | null>(null);
  const statusRef = useRef<SpotifyPlayerStatus>("idle");
  const onPlaybackErrorRef = useRef(onPlaybackError);
  onPlaybackErrorRef.current = onPlaybackError;

  const [status, setStatus] = useState<SpotifyPlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
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

  const applyMappedState = useCallback((mapped: MappedPlayerState | null) => {
    if (!mapped) {
      setIsPlaying(false);
      onPlaybackInterrupted?.(
        "Playback moved to another device — close Spotify on other devices and try again."
      );
      return;
    }
    setIsPlaying(mapped.isPlaying);
    setPositionMs(mapped.positionMs);
    setDurationMs(mapped.durationMs);
    setCurrentTrackUri(mapped.currentTrackUri);
  }, [onPlaybackInterrupted]);

  const syncCurrentState = useCallback(async () => {
    const state = await playerRef.current?.getCurrentState();
    const mapped = mapPlayerState(state as SpotifyPlaybackState | null);
    if (mapped) applyMappedState(mapped);
    return mapped;
  }, [applyMappedState]);

  const disconnect = useCallback(() => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    deviceIdRef.current = null;
    setDeviceId(null);
    updateStatus("idle");
  }, [updateStatus]);

  const connect = useCallback(async () => {
    if (!authTokenRef.current) {
      setError("Sign in required");
      updateStatus("error");
      return;
    }

    setError(null);
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

      const fetchToken = async (cb: (token: string) => void) => {
        if (!authTokenRef.current) {
          cb("");
          return;
        }
        try {
          const accessToken = await fetchPlayerToken();
          cb(accessToken);
        } catch (err) {
          console.error("Spotify player token refresh failed:", err);
          const message =
            err instanceof Error ? err.message : "Spotify session expired";
          onPlaybackErrorRef.current?.(
            message.includes("Session expired")
              ? message
              : "Spotify session expired — reconnect on /spotify"
          );
          cb("");
        }
      };

      const player = new window.Spotify.Player({
        name: "CCS DJ Deck",
        volume,
        getOAuthToken: (cb) => {
          void fetchToken(cb);
        },
      });

      player.addListener("ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        deviceIdRef.current = device_id;
        setDeviceId(device_id);
        updateStatus("ready");
        setError(null);
      });

      player.addListener("not_ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        deviceIdRef.current = device_id;
        setDeviceId(device_id);
        updateStatus("connecting");
      });

      player.addListener("player_state_changed", (state) => {
        applyMappedState(
          mapPlayerState(state as SpotifyPlaybackState | null)
        );
      });

      player.addListener("initialization_error", (payload) => {
        const { message } = payload as { message: string };
        setError(message);
        updateStatus("error");
      });

      player.addListener("authentication_error", (payload) => {
        const { message } = payload as { message: string };
        setError(message);
        updateStatus("error");
      });

      player.addListener("account_error", () => {
        setError("Spotify Premium is required for in-browser playback.");
        updateStatus("error");
      });

      player.addListener("playback_error", (payload) => {
        const { message } = payload as { message: string };
        onPlaybackErrorRef.current?.(message);
      });

      playerRef.current = player;
      await player.activateElement();
      const connected = await player.connect();
      if (!connected) {
        throw new Error("Failed to connect Spotify player");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect player");
      updateStatus("error");
    }
  }, [applyMappedState, updateStatus, volume]);

  const playUri = useCallback(
    async (uri: string, positionMs?: number) => {
      const id = deviceIdRef.current;
      if (!authTokenRef.current || !id) {
        throw new Error("Player is not ready");
      }
      if (statusRef.current !== "ready") {
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
    },
    [syncCurrentState]
  );

  const pause = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!authTokenRef.current || !id) return;
    await playerApi("/api/spotify/player/pause", { deviceId: id });
    await playerRef.current?.pause();
    await syncCurrentState();
  }, [syncCurrentState]);

  const primeTrack = useCallback(
    async (uri: string) => {
      const id = deviceIdRef.current;
      if (!authTokenRef.current || !id) return;
      if (statusRef.current !== "ready") return;

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
    },
    [syncCurrentState]
  );

  const resume = useCallback(async () => {
    await playerRef.current?.activateElement();
    await playerRef.current?.resume();
    await syncCurrentState();
  }, [syncCurrentState]);

  const seek = useCallback(
    async (positionMs: number) => {
      const id = deviceIdRef.current;
      if (!authTokenRef.current || !id) return;
      await playerApi("/api/spotify/player/seek", {
        deviceId: id,
        positionMs,
      });
      await syncCurrentState();
    },
    [syncCurrentState]
  );

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolumeState(clamped);
    void playerRef.current?.setVolume(clamped);
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnect();
    }
  }, [enabled, disconnect]);

  useEffect(() => {
    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  return {
    status,
    error,
    deviceId,
    isPlaying,
    positionMs,
    durationMs,
    currentTrackUri,
    volume,
    connect,
    disconnect,
    primeTrack,
    playUri,
    pause,
    resume,
    seek,
    setVolume,
  };
}
