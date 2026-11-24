export type MusicProviderId = "apple_music";

export type NormalizedTrack = {
  provider: MusicProviderId;
  catalogId?: string;
  libraryId?: string;
  isrc?: string | null;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  durationMs?: number;
  genreNames?: string[];
  playable?: boolean;
};

export type PlaybackState = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  currentTrack: NormalizedTrack | null;
};

export type DjPlaybackAdapter = {
  initialize(): Promise<void>;
  authorize(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  playTrack(catalogId: string): Promise<void>;
  playNext(): Promise<void>;
  playPrevious(): Promise<void>;
  getNowPlaying(): NormalizedTrack | null;
  getPlaybackState(): PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
};
