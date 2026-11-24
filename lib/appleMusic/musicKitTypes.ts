export type MusicKitPlaybackState = "none" | "loading" | "playing" | "paused" | "stopped" | "ended" | "completed" | "waiting" | "interrupted" | "seeking";

export type MusicKitMediaItem = {
  id: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    genreNames?: string[];
    playParams?: { id?: string; catalogId?: string; isLibrary?: boolean };
    artwork?: { url?: string; width?: number; height?: number };
  };
  playParams?: { id?: string; catalogId?: string; isLibrary?: boolean };
};

export type MusicKitInstance = {
  authorize: () => Promise<string>;
  unauthorize: () => Promise<void>;
  isAuthorized: boolean;
  musicUserToken: string;
  storefrontId: string;
  volume: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  currentPlaybackState: MusicKitPlaybackState;
  isPlaying: boolean;
  nowPlayingItem: MusicKitMediaItem | null;
  queue: { items?: MusicKitMediaItem[] };
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekToTime: (time: number) => Promise<void>;
  skipToNextItem: () => Promise<void>;
  skipToPreviousItem: () => Promise<void>;
  setQueue: (input: {
    song?: string;
    songs?: string[];
    startWith?: number;
  }) => Promise<void>;
  addEventListener: (
    name: string,
    listener: (event: { item?: MusicKitMediaItem }) => void
  ) => void;
  removeEventListener: (
    name: string,
    listener: (event: { item?: MusicKitMediaItem }) => void
  ) => void;
  api: {
    music: (
      path: string,
      options?: { method?: string; parameters?: Record<string, unknown> }
    ) => Promise<unknown>;
  };
};

export type MusicKitStatic = {
  configure: (config: {
    developerToken: string;
    app: { name: string; build: string };
  }) => Promise<void>;
  getInstance: () => MusicKitInstance;
};

declare global {
  interface Window {
    MusicKit?: MusicKitStatic;
  }
}
