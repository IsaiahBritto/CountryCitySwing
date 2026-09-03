"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    if (existing) {
      if (window.Spotify?.Player) {
        resolve();
        return;
      }
    } else {
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
  playUri: (uri: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => void;
};

async function fetchPlayerToken(authToken: string): Promise<string> {
  const res = await fetch("/api/spotify/player-token", {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? "Failed to fetch player token"
    );
  }
  return (body as { accessToken: string }).accessToken;
}

async function playerApi(
  authToken: string,
  path: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? "Playback command failed"
    );
  }
}

function mapPlayerState(state: SpotifyPlaybackState | null, volume: number) {
  if (!state) {
    return {
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      currentTrackUri: null as string | null,
      volume,
    };
  }
  const current = state.track_window.current_track;
  return {
    isPlaying: !state.paused,
    positionMs: state.position,
    durationMs: current?.duration_ms ?? 0,
    currentTrackUri: current?.uri ?? null,
    volume,
  };
}

export function useSpotifyPlayer(
  options: UseSpotifyPlayerOptions
): UseSpotifyPlayerReturn {
  const { authToken, enabled, onPlaybackError } = options;
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const [status, setStatus] = useState<SpotifyPlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTrackUri, setCurrentTrackUri] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1);

  const applyState = useCallback((state: SpotifyPlaybackState | null) => {
    const mapped = mapPlayerState(state, volume);
    setIsPlaying(mapped.isPlaying);
    setPositionMs(mapped.positionMs);
    setDurationMs(mapped.durationMs);
    setCurrentTrackUri(mapped.currentTrackUri);
  }, [volume]);

  const disconnect = useCallback(() => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    setDeviceId(null);
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    if (!authTokenRef.current) {
      setError("Sign in required");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("loading_sdk");

    try {
      await loadSpotifySdk();
      if (!window.Spotify?.Player) {
        throw new Error("Spotify Web Playback SDK unavailable");
      }

      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }

      setStatus("connecting");

      const player = new window.Spotify.Player({
        name: "CCS DJ Deck",
        volume,
        getOAuthToken: (cb) => {
          const token = authTokenRef.current;
          if (!token) {
            cb("");
            return;
          }
          fetchPlayerToken(token)
            .then(cb)
            .catch(() => cb(""));
        },
      });

      player.addListener("ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        setDeviceId(device_id);
        setStatus("ready");
        setError(null);
      });

      player.addListener("not_ready", (payload) => {
        const { device_id } = payload as { device_id: string };
        setDeviceId(device_id);
        setStatus("connecting");
      });

      player.addListener("player_state_changed", (state) => {
        applyState(state as SpotifyPlaybackState | null);
      });

      player.addListener("initialization_error", (payload) => {
        const { message } = payload as { message: string };
        setError(message);
        setStatus("error");
      });

      player.addListener("authentication_error", (payload) => {
        const { message } = payload as { message: string };
        setError(message);
        setStatus("error");
      });

      player.addListener("account_error", (payload) => {
        void payload;
        setError("Spotify Premium is required for in-browser playback.");
        setStatus("error");
      });

      player.addListener("playback_error", (payload) => {
        const { message } = payload as { message: string };
        onPlaybackError?.(message);
      });

      playerRef.current = player;
      await player.activateElement();
      const connected = await player.connect();
      if (!connected) {
        throw new Error("Failed to connect Spotify player");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect player");
      setStatus("error");
    }
  }, [applyState, onPlaybackError, volume]);

  const playUri = useCallback(
    async (uri: string) => {
      const token = authTokenRef.current;
      const id = deviceId;
      if (!token || !id) {
        throw new Error("Player is not ready");
      }
      await playerApi(token, "/api/spotify/player/play", {
        uri,
        deviceId: id,
      });
    },
    [deviceId]
  );

  const pause = useCallback(async () => {
    const token = authTokenRef.current;
    if (!token || !deviceId) return;
    await playerApi(token, "/api/spotify/player/pause", { deviceId });
    await playerRef.current?.pause();
  }, [deviceId]);

  const resume = useCallback(async () => {
    await playerRef.current?.resume();
  }, []);

  const seek = useCallback(
    async (positionMs: number) => {
      const token = authTokenRef.current;
      if (!token || !deviceId) return;
      await playerApi(token, "/api/spotify/player/seek", {
        deviceId,
        positionMs,
      });
    },
    [deviceId]
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
    playUri,
    pause,
    resume,
    seek,
    setVolume,
  };
}
