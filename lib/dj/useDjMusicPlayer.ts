"use client";

import { useOptionalMusicPlatform } from "@/components/music/MusicPlatformProvider";
import { getDjMusicProvider } from "@/lib/dj/musicProvider";
import { useMusicKitPlayer } from "@/lib/appleMusic/useMusicKitPlayer";
import {
  useSpotifyPlayer,
  type ControllerPlaybackSnapshot,
  type UseSpotifyPlayerOptions,
} from "@/lib/spotify/useSpotifyPlayer";

export type UseDjMusicPlayerOptions = {
  authToken: string | null;
  enabled: boolean;
  mode?: "host" | "controller";
  controllerSnapshot?: ControllerPlaybackSnapshot | null;
  onPlaybackError?: (message: string) => void;
  onPlaybackInterrupted?: (message: string) => void;
  onPlaybackCompleted?: () => void;
};

export type DjMusicPlayerReturn = ReturnType<typeof useSpotifyPlayer> & {
  isAuthorized?: boolean;
  musicUserToken?: string | null;
  storefrontId?: string | null;
  currentTrackIsrc?: string | null;
  authorize?: () => Promise<void>;
  skipToNext?: () => Promise<void>;
  skipToPrevious?: () => Promise<void>;
};

export function useDjMusicPlayer(
  options: UseDjMusicPlayerOptions
): DjMusicPlayerReturn {
  const platform = useOptionalMusicPlatform();
  const provider = platform?.provider ?? getDjMusicProvider();
  const appleEnabled = options.enabled && provider === "apple_music";
  const spotifyEnabled = options.enabled && provider === "spotify";

  const apple = useMusicKitPlayer({
    authToken: options.authToken,
    enabled: appleEnabled,
    mode: options.mode,
    controllerSnapshot: options.controllerSnapshot,
    onPlaybackError: options.onPlaybackError,
    onPlaybackInterrupted: options.onPlaybackInterrupted,
    onPlaybackCompleted: options.onPlaybackCompleted,
  });
  const spotify = useSpotifyPlayer({
    ...(options as UseSpotifyPlayerOptions),
    enabled: spotifyEnabled,
  });

  if (provider === "apple_music") {
    return {
      status: apple.status as DjMusicPlayerReturn["status"],
      error: apple.error,
      notice: apple.notice as DjMusicPlayerReturn["notice"],
      deviceId: apple.deviceId,
      isPlaying: apple.isPlaying,
      positionMs: apple.positionMs,
      durationMs: apple.durationMs,
      currentTrackUri: apple.currentTrackUri,
      volume: apple.volume,
      connect: apple.connect,
      reconnect: apple.reconnect,
      disconnect: apple.disconnect,
      primeTrack: apple.primeTrack,
      playUri: apple.playUri,
      pause: apple.pause,
      resume: apple.resume,
      seek: apple.seek,
      setVolume: apple.setVolume,
      syncState: apple.syncState,
      dismissNotice: apple.dismissNotice,
      isAuthorized: apple.isAuthorized,
      musicUserToken: apple.musicUserToken,
      storefrontId: apple.storefrontId,
      currentTrackIsrc: apple.currentTrackIsrc,
      authorize: apple.authorize,
      skipToNext: apple.skipToNext,
      skipToPrevious: apple.skipToPrevious,
    };
  }

  return spotify;
}
