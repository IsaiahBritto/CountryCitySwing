export type SpotifyPlaybackState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      uri: string;
      name: string;
      artists: Array<{ name: string }>;
      duration_ms: number;
    } | null;
  };
};

export type SpotifyPlayerInstance = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (
    event: string,
    callback: (payload: unknown) => void
  ) => void;
  removeListener: (event: string) => void;
  getCurrentState: () => Promise<SpotifyPlaybackState | null>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  activateElement: () => Promise<void>;
};

export type SpotifyPlayerConstructor = new (options: {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}) => SpotifyPlayerInstance;

declare global {
  interface Window {
    Spotify?: {
      Player: SpotifyPlayerConstructor;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export {};
