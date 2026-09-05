export type DeckId = "A" | "B";

export type DeckTrack = {
  id: string;
  uri: string;
  name: string;
  primaryArtist: string;
  durationMs: number;
  bpm?: number;
};

export type PlaybackSource = "queue" | "playlist";
export type AfterQueueBehavior = "continue" | "stop";

export type DeckState = {
  enabled: boolean;
  playlistId: string | null;
  playlistName: string | null;
  playlist: DeckTrack[];
  playlistTotalDurationMs: number;
  /** Upcoming queue tracks only — not the currently playing song */
  playQueue: DeckTrack[];
  playQueueIndex: number | null;
  playlistIndex: number | null;
  /** Playlist index deferred while queue runs (Up Next after queue) */
  playlistResumeIndex: number | null;
  playbackSource: PlaybackSource;
  afterQueueBehavior: AfterQueueBehavior;
  afterQueueContinueDeck: DeckId;
  playedPlaylistIndices: number[];
  track: DeckTrack | null;
  savedPositionMs: number;
  skippedAfterCurrent: number;
};

export type DjDeckState = {
  deckA: DeckState;
  deckB: DeckState;
  secondDeckEnabled: boolean;
  activeDeck: DeckId;
  deckVolume: Record<DeckId, number>;
  deckCrossfadeSeconds: Record<DeckId, number>;
  masterVolume: number;
  highlightedQueueIndex: Record<DeckId, number | null>;
  highlightedPlaylistIndex: Record<DeckId, number | null>;
};

export type DjDeckAction =
  | { type: "ENABLE_SECOND_DECK" }
  | { type: "DISABLE_SECOND_DECK" }
  | {
      type: "SELECT_PLAYLIST";
      deck: DeckId;
      playlistId: string;
      playlistName: string;
    }
  | {
      type: "SET_PLAYLIST";
      deck: DeckId;
      playlist: DeckTrack[];
      playlistTotalDurationMs: number;
    }
  | { type: "SET_ACTIVE_DECK"; deck: DeckId }
  | { type: "SET_PLAYLIST_INDEX"; deck: DeckId; index: number }
  | { type: "SET_PLAY_QUEUE_INDEX"; deck: DeckId; index: number }
  | { type: "SET_PLAYBACK_SOURCE"; deck: DeckId; source: PlaybackSource }
  | { type: "ADD_TO_PLAY_QUEUE"; deck: DeckId; track: DeckTrack }
  | { type: "REMOVE_FROM_PLAY_QUEUE"; deck: DeckId; index: number }
  | { type: "MOVE_PLAY_QUEUE_ITEM"; deck: DeckId; fromIndex: number; toIndex: number }
  | { type: "CLEAR_PLAY_QUEUE"; deck: DeckId }
  | {
      type: "SET_AFTER_QUEUE_BEHAVIOR";
      deck: DeckId;
      behavior: AfterQueueBehavior;
    }
  | { type: "SET_AFTER_QUEUE_CONTINUE_DECK"; deck: DeckId; targetDeck: DeckId }
  | { type: "ADVANCE_TRACK"; deck: DeckId }
  | { type: "SKIP_UP_NEXT"; deck: DeckId }
  | { type: "PREVIOUS_TRACK"; deck: DeckId }
  | { type: "MARK_PLAYLIST_INDEX_PLAYED"; deck: DeckId; index: number }
  | { type: "TRANSITION_TO_PLAYLIST"; deck: DeckId; playlistIndex: number }
  | { type: "QUEUE_EXHAUSTED"; deck: DeckId }
  | { type: "SET_SAVED_POSITION"; deck: DeckId; positionMs: number }
  | { type: "SET_DECK_VOLUME"; deck: DeckId; value: number }
  | { type: "SET_DECK_CROSSFADE"; deck: DeckId; seconds: number }
  | { type: "SET_MASTER_VOLUME"; value: number }
  | { type: "HIGHLIGHT_QUEUE_ROW"; deck: DeckId; index: number | null }
  | { type: "HIGHLIGHT_PLAYLIST_ROW"; deck: DeckId; index: number | null }
  | { type: "RESTORE_SESSION"; state: DjDeckState };

function createEmptyDeckState(enabled: boolean, deckId: DeckId): DeckState {
  return {
    enabled,
    playlistId: null,
    playlistName: null,
    playlist: [],
    playlistTotalDurationMs: 0,
    playQueue: [],
    playQueueIndex: null,
    playlistIndex: null,
    playlistResumeIndex: null,
    playbackSource: "playlist",
    afterQueueBehavior: "continue",
    afterQueueContinueDeck: deckId,
    playedPlaylistIndices: [],
    track: null,
    savedPositionMs: 0,
    skippedAfterCurrent: 0,
  };
}

export const INITIAL_DJ_DECK_STATE: DjDeckState = {
  deckA: createEmptyDeckState(true, "A"),
  deckB: createEmptyDeckState(false, "B"),
  secondDeckEnabled: false,
  activeDeck: "A",
  deckVolume: { A: 1, B: 1 },
  deckCrossfadeSeconds: { A: 0, B: 0 },
  masterVolume: 1,
  highlightedQueueIndex: { A: null, B: null },
  highlightedPlaylistIndex: { A: null, B: null },
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clampCrossfadeSeconds(value: number): number {
  const clamped = Math.max(0, Math.min(10, value));
  return Math.round(clamped * 2) / 2;
}

export function crossfadeSecondsToMs(seconds: number): number {
  return clampCrossfadeSeconds(seconds) * 1000;
}

function updateDeck(
  state: DjDeckState,
  deck: DeckId,
  updater: (deckState: DeckState) => DeckState
): DjDeckState {
  return deck === "A"
    ? { ...state, deckA: updater(state.deckA) }
    : { ...state, deckB: updater(state.deckB) };
}

function markPlaylistIndexPlayed(
  played: number[],
  index: number
): number[] {
  if (played.includes(index)) return played;
  return [...played, index].sort((a, b) => a - b);
}

function findPlaylistIndexForTrack(
  playlist: DeckTrack[],
  track: DeckTrack
): number | null {
  const idx = playlist.findIndex((t) => t.id === track.id);
  return idx >= 0 ? idx : null;
}

function capturePlaylistResumeIndex(d: DeckState): number | null {
  if (
    d.playbackSource === "playlist" &&
    d.playlistResumeIndex == null &&
    d.playlistIndex != null
  ) {
    return d.playlistIndex + 1 + d.skippedAfterCurrent;
  }
  return d.playlistResumeIndex;
}

function consumeQueueAtIndex(
  playQueue: DeckTrack[],
  index: number
): { track: DeckTrack; playQueue: DeckTrack[] } | null {
  if (index < 0 || index >= playQueue.length) return null;
  const track = playQueue[index];
  const nextQueue = [...playQueue];
  nextQueue.splice(index, 1);
  return { track, playQueue: nextQueue };
}

function consumeQueueHead(d: DeckState): {
  track: DeckTrack;
  playQueue: DeckTrack[];
} | null {
  const consumed = consumeQueueAtIndex(d.playQueue, d.skippedAfterCurrent);
  return consumed;
}

export function hasPendingQueue(deckState: DeckState): boolean {
  return deckState.playQueue.length > 0;
}

export function getQueueHead(deckState: DeckState): DeckTrack | null {
  return deckState.playQueue[deckState.skippedAfterCurrent] ?? null;
}

export function getActiveList(state: DjDeckState, deck: DeckId): DeckTrack[] {
  const d = getDeckState(state, deck);
  return d.playbackSource === "queue" ? d.playQueue : d.playlist;
}

export function getActiveIndex(state: DjDeckState, deck: DeckId): number | null {
  const d = getDeckState(state, deck);
  return d.playbackSource === "queue" ? d.playQueueIndex : d.playlistIndex;
}

export function getNextUnplayedPlaylistIndex(state: DjDeckState, deck: DeckId): number | null {
  const d = getDeckState(state, deck);
  for (let i = 0; i < d.playlist.length; i++) {
    if (!d.playedPlaylistIndices.includes(i)) return i;
  }
  return null;
}

export function djDeckReducer(
  state: DjDeckState,
  action: DjDeckAction
): DjDeckState {
  switch (action.type) {
    case "ENABLE_SECOND_DECK":
      return {
        ...state,
        secondDeckEnabled: true,
        deckB: { ...state.deckB, enabled: true },
      };
    case "DISABLE_SECOND_DECK": {
      const resetAfterQueueContinue = (deck: DeckState): DeckState =>
        deck.afterQueueContinueDeck === "B"
          ? { ...deck, afterQueueContinueDeck: "A" }
          : deck;
      return {
        ...state,
        secondDeckEnabled: false,
        activeDeck: state.activeDeck === "B" ? "A" : state.activeDeck,
        deckA: resetAfterQueueContinue(state.deckA),
        deckB: createEmptyDeckState(false, "B"),
        highlightedQueueIndex: {
          ...state.highlightedQueueIndex,
          B: null,
        },
        highlightedPlaylistIndex: {
          ...state.highlightedPlaylistIndex,
          B: null,
        },
      };
    }
    case "SELECT_PLAYLIST":
      return updateDeck(state, action.deck, (deck) => ({
        ...createEmptyDeckState(deck.enabled, action.deck),
        enabled: deck.enabled,
        playlistId: action.playlistId,
        playlistName: action.playlistName,
      }));
    case "SET_PLAYLIST": {
      const first = action.playlist[0] ?? null;
      return updateDeck(state, action.deck, (deck) => ({
        ...deck,
        playlist: action.playlist,
        playlistTotalDurationMs: action.playlistTotalDurationMs,
        playlistIndex: first ? 0 : null,
        playlistResumeIndex: null,
        track: first,
        savedPositionMs: 0,
        skippedAfterCurrent: 0,
        playedPlaylistIndices: [],
        playQueue: [],
        playQueueIndex: null,
        playbackSource: "playlist",
      }));
    }
    case "SET_ACTIVE_DECK":
      return { ...state, activeDeck: action.deck };
    case "SET_PLAYLIST_INDEX": {
      const deck = getDeckState(state, action.deck);
      const track = deck.playlist[action.index] ?? null;
      if (!track) return state;
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playbackSource: "playlist",
        playlistIndex: action.index,
        playlistResumeIndex: null,
        track,
        savedPositionMs: 0,
        skippedAfterCurrent: 0,
        playedPlaylistIndices: markPlaylistIndexPlayed(
          d.playedPlaylistIndices,
          action.index
        ),
      }));
    }
    case "SET_PLAY_QUEUE_INDEX": {
      const deck = getDeckState(state, action.deck);
      const consumed = consumeQueueAtIndex(deck.playQueue, action.index);
      if (!consumed) return state;
      const playlistIdx = findPlaylistIndexForTrack(deck.playlist, consumed.track);
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playbackSource: "queue",
        playQueueIndex: null,
        playQueue: consumed.playQueue,
        track: consumed.track,
        savedPositionMs: 0,
        skippedAfterCurrent: 0,
        playlistResumeIndex: capturePlaylistResumeIndex(d),
        playedPlaylistIndices:
          playlistIdx != null
            ? markPlaylistIndexPlayed(d.playedPlaylistIndices, playlistIdx)
            : d.playedPlaylistIndices,
      }));
    }
    case "SET_PLAYBACK_SOURCE":
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playbackSource: action.source,
      }));
    case "ADD_TO_PLAY_QUEUE":
      return updateDeck(state, action.deck, (d) => {
        if (d.playQueue.some((t) => t.id === action.track.id)) return d;
        return { ...d, playQueue: [...d.playQueue, action.track] };
      });
    case "REMOVE_FROM_PLAY_QUEUE":
      return updateDeck(state, action.deck, (d) => {
        if (action.index < 0 || action.index >= d.playQueue.length) return d;
        return {
          ...d,
          playQueue: d.playQueue.filter((_, i) => i !== action.index),
        };
      });
    case "MOVE_PLAY_QUEUE_ITEM":
      return updateDeck(state, action.deck, (d) => {
        const { fromIndex, toIndex } = action;
        if (
          fromIndex < 0 ||
          fromIndex >= d.playQueue.length ||
          toIndex < 0 ||
          toIndex >= d.playQueue.length ||
          fromIndex === toIndex
        ) {
          return d;
        }
        const playQueue = [...d.playQueue];
        const [item] = playQueue.splice(fromIndex, 1);
        playQueue.splice(toIndex, 0, item);
        return { ...d, playQueue };
      });
    case "CLEAR_PLAY_QUEUE":
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playQueue: [],
        playQueueIndex: null,
        ...(d.playbackSource === "queue"
          ? { track: null, playbackSource: "playlist" as PlaybackSource }
          : {}),
      }));
    case "SET_AFTER_QUEUE_BEHAVIOR":
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        afterQueueBehavior: action.behavior,
      }));
    case "SET_AFTER_QUEUE_CONTINUE_DECK":
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        afterQueueContinueDeck: action.targetDeck,
      }));
    case "ADVANCE_TRACK": {
      const deck = getDeckState(state, action.deck);
      if (deck.playbackSource === "queue") {
        const consumed = consumeQueueHead(deck);
        if (!consumed) return state;
        const playlistIdx = findPlaylistIndexForTrack(deck.playlist, consumed.track);
        return updateDeck(state, action.deck, (d) => ({
          ...d,
          playQueueIndex: null,
          playQueue: consumed.playQueue,
          track: consumed.track,
          savedPositionMs: 0,
          skippedAfterCurrent: 0,
          playedPlaylistIndices:
            playlistIdx != null
              ? markPlaylistIndexPlayed(d.playedPlaylistIndices, playlistIdx)
              : d.playedPlaylistIndices,
        }));
      }
      if (deck.playlistIndex == null) return state;
      const nextIndex = deck.playlistIndex + 1 + deck.skippedAfterCurrent;
      const nextTrack = deck.playlist[nextIndex] ?? null;
      if (!nextTrack) return state;
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playlistIndex: nextIndex,
        playlistResumeIndex: null,
        track: nextTrack,
        savedPositionMs: 0,
        skippedAfterCurrent: 0,
        playedPlaylistIndices: markPlaylistIndexPlayed(
          d.playedPlaylistIndices,
          nextIndex
        ),
      }));
    }
    case "SKIP_UP_NEXT": {
      const deck = getDeckState(state, action.deck);
      if (hasPendingQueue(deck) && deck.playbackSource !== "queue") {
        const skipIndex = deck.skippedAfterCurrent;
        if (!deck.playQueue[skipIndex]) return state;
        return updateDeck(state, action.deck, (d) => ({
          ...d,
          skippedAfterCurrent: d.skippedAfterCurrent + 1,
        }));
      }
      if (deck.playbackSource === "queue" && hasPendingQueue(deck)) {
        const skipIndex = deck.skippedAfterCurrent;
        if (!deck.playQueue[skipIndex]) return state;
        return updateDeck(state, action.deck, (d) => ({
          ...d,
          skippedAfterCurrent: d.skippedAfterCurrent + 1,
        }));
      }
      const list = getActiveList(state, action.deck);
      const idx = getActiveIndex(state, action.deck);
      if (idx == null) return state;
      const upNextIndex = idx + 1 + deck.skippedAfterCurrent;
      if (!list[upNextIndex]) return state;
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        skippedAfterCurrent: d.skippedAfterCurrent + 1,
      }));
    }
    case "PREVIOUS_TRACK": {
      const deck = getDeckState(state, action.deck);
      if (deck.playbackSource === "queue") return state;
      const idx = deck.playlistIndex;
      if (idx == null || idx <= 0) return state;
      const prevIndex = idx - 1;
      const prevTrack = deck.playlist[prevIndex];
      if (!prevTrack) return state;
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playlistIndex: prevIndex,
        track: prevTrack,
        savedPositionMs: 0,
        skippedAfterCurrent: 0,
        playedPlaylistIndices: markPlaylistIndexPlayed(
          d.playedPlaylistIndices,
          prevIndex
        ),
      }));
    }
    case "MARK_PLAYLIST_INDEX_PLAYED":
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playedPlaylistIndices: markPlaylistIndexPlayed(
          d.playedPlaylistIndices,
          action.index
        ),
      }));
    case "TRANSITION_TO_PLAYLIST": {
      const deck = getDeckState(state, action.deck);
      const track = deck.playlist[action.playlistIndex] ?? null;
      if (!track) return state;
      return updateDeck(state, action.deck, (d) => ({
        ...d,
        playbackSource: "playlist",
        playQueueIndex: null,
        playlistIndex: action.playlistIndex,
        playlistResumeIndex: null,
        track,
        savedPositionMs: 0,
        skippedAfterCurrent: 0,
        playedPlaylistIndices: markPlaylistIndexPlayed(
          d.playedPlaylistIndices,
          action.playlistIndex
        ),
      }));
    }
    case "QUEUE_EXHAUSTED":
      return updateDeck(state, action.deck, (d) => {
        const resumeTrack =
          d.playlistResumeIndex != null
            ? d.playlist[d.playlistResumeIndex]
            : null;
        const resumeAlreadyPlaying =
          resumeTrack != null && d.track?.id === resumeTrack.id;
        return {
          ...d,
          playbackSource: "playlist",
          playQueueIndex: null,
          ...(resumeAlreadyPlaying ? { playlistResumeIndex: null } : {}),
        };
      });
    case "SET_SAVED_POSITION":
      return updateDeck(state, action.deck, (deck) => ({
        ...deck,
        savedPositionMs: Math.max(0, action.positionMs),
      }));
    case "SET_DECK_VOLUME":
      return {
        ...state,
        deckVolume: {
          ...state.deckVolume,
          [action.deck]: clampUnit(action.value),
        },
      };
    case "SET_DECK_CROSSFADE":
      return {
        ...state,
        deckCrossfadeSeconds: {
          ...state.deckCrossfadeSeconds,
          [action.deck]: clampCrossfadeSeconds(action.seconds),
        },
      };
    case "SET_MASTER_VOLUME":
      return { ...state, masterVolume: clampUnit(action.value) };
    case "HIGHLIGHT_QUEUE_ROW":
      return {
        ...state,
        highlightedQueueIndex: {
          ...state.highlightedQueueIndex,
          [action.deck]: action.index,
        },
      };
    case "HIGHLIGHT_PLAYLIST_ROW":
      return {
        ...state,
        highlightedPlaylistIndex: {
          ...state.highlightedPlaylistIndex,
          [action.deck]: action.index,
        },
      };
    case "RESTORE_SESSION":
      return normalizeDjDeckState(action.state);
    default:
      return state;
  }
}

export function getDeckState(state: DjDeckState, deck: DeckId): DeckState {
  return deck === "A" ? state.deckA : state.deckB;
}

export function getNowPlaying(state: DjDeckState): DeckTrack | null {
  return getDeckState(state, state.activeDeck).track;
}

function playlistTrackAt(
  deckState: DeckState,
  index: number
): DeckTrack | null {
  return deckState.playlist[index] ?? null;
}

function isCurrentTrack(deckState: DeckState, candidate: DeckTrack | null): boolean {
  return candidate != null && deckState.track?.id === candidate.id;
}

function getNextPlaylistTrackAfter(
  deckState: DeckState,
  startIndex: number
): DeckTrack | null {
  let index = startIndex + deckState.skippedAfterCurrent;
  while (index < deckState.playlist.length) {
    const candidate = playlistTrackAt(deckState, index);
    if (candidate && !isCurrentTrack(deckState, candidate)) {
      return candidate;
    }
    index += 1;
  }
  return null;
}

export function getUpNext(state: DjDeckState, deck: DeckId): DeckTrack | null {
  const deckState = getDeckState(state, deck);

  if (hasPendingQueue(deckState)) {
    return getQueueHead(deckState);
  }

  if (deckState.playlistResumeIndex != null) {
    const resumeIndex =
      deckState.playlistResumeIndex + deckState.skippedAfterCurrent;
    const resumeTrack = playlistTrackAt(deckState, resumeIndex);
    if (resumeTrack && !isCurrentTrack(deckState, resumeTrack)) {
      return resumeTrack;
    }
  }

  if (deckState.playlistIndex == null) return null;
  return getNextPlaylistTrackAfter(deckState, deckState.playlistIndex + 1);
}

export function isPlayQueueExhausted(state: DjDeckState, deck: DeckId): boolean {
  const d = getDeckState(state, deck);
  if (d.playbackSource !== "queue") return false;
  return d.playQueue.length === 0;
}

export function shouldPlayQueueNext(state: DjDeckState, deck: DeckId): boolean {
  const d = getDeckState(state, deck);
  if (!hasPendingQueue(d)) return false;
  if (d.playbackSource !== "queue") return true;
  return true;
}

export type QueueRowStatus = "played" | "current" | "upcoming";

export function playQueueRowStatus(
  _state: DjDeckState,
  _deck: DeckId,
  _index: number
): QueueRowStatus {
  return "upcoming";
}

export function playlistRowStatus(
  state: DjDeckState,
  deck: DeckId,
  index: number
): QueueRowStatus {
  const d = getDeckState(state, deck);
  if (d.playbackSource === "playlist" && d.playlistIndex === index) {
    return "current";
  }
  if (d.playedPlaylistIndices.includes(index)) return "played";
  return "upcoming";
}

/** @deprecated use playlistRowStatus */
export function queueRowStatus(
  state: DjDeckState,
  deck: DeckId,
  index: number
): QueueRowStatus {
  return playlistRowStatus(state, deck, index);
}

export function playQueueTotalDurationMs(playQueue: DeckTrack[]): number {
  return playQueue.reduce((sum, t) => sum + t.durationMs, 0);
}

export function formatTrackDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTotalDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

export function isTrackInPlayQueue(
  state: DjDeckState,
  deck: DeckId,
  trackId: string
): boolean {
  return getDeckState(state, deck).playQueue.some((t) => t.id === trackId);
}

function parseDeckTrack(raw: unknown): DeckTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.uri !== "string") return null;
  if (typeof t.name !== "string" || typeof t.primaryArtist !== "string") {
    return null;
  }
  if (typeof t.durationMs !== "number" || !Number.isFinite(t.durationMs)) {
    return null;
  }
  const track: DeckTrack = {
    id: t.id,
    uri: t.uri,
    name: t.name,
    primaryArtist: t.primaryArtist,
    durationMs: Math.max(0, t.durationMs),
  };
  if (typeof t.bpm === "number" && Number.isFinite(t.bpm)) {
    track.bpm = t.bpm;
  }
  return track;
}

function parseDeckState(raw: unknown, deckId: DeckId): DeckState {
  const empty = createEmptyDeckState(deckId === "A", deckId);
  if (!raw || typeof raw !== "object") return empty;
  const d = raw as Record<string, unknown>;

  const playlist = Array.isArray(d.playlist)
    ? d.playlist.map(parseDeckTrack).filter((t): t is DeckTrack => t != null)
    : [];

  const playQueue = Array.isArray(d.playQueue)
    ? d.playQueue.map(parseDeckTrack).filter((t): t is DeckTrack => t != null)
    : [];

  const playedPlaylistIndices = Array.isArray(d.playedPlaylistIndices)
    ? d.playedPlaylistIndices.filter(
        (i): i is number => typeof i === "number" && Number.isInteger(i)
      )
    : [];

  return {
    enabled: d.enabled === true || (deckId === "A" && d.enabled !== false),
    playlistId: typeof d.playlistId === "string" ? d.playlistId : null,
    playlistName: typeof d.playlistName === "string" ? d.playlistName : null,
    playlist,
    playlistTotalDurationMs:
      typeof d.playlistTotalDurationMs === "number"
        ? Math.max(0, d.playlistTotalDurationMs)
        : playlist.reduce((sum, t) => sum + t.durationMs, 0),
    playQueue,
    playQueueIndex:
      typeof d.playQueueIndex === "number" ? d.playQueueIndex : null,
    playlistIndex:
      typeof d.playlistIndex === "number" ? d.playlistIndex : null,
    playlistResumeIndex:
      typeof d.playlistResumeIndex === "number"
        ? d.playlistResumeIndex
        : null,
    playbackSource: d.playbackSource === "queue" ? "queue" : "playlist",
    afterQueueBehavior: d.afterQueueBehavior === "stop" ? "stop" : "continue",
    afterQueueContinueDeck: d.afterQueueContinueDeck === "B" ? "B" : "A",
    playedPlaylistIndices,
    track: parseDeckTrack(d.track),
    savedPositionMs:
      typeof d.savedPositionMs === "number"
        ? Math.max(0, d.savedPositionMs)
        : 0,
    skippedAfterCurrent:
      typeof d.skippedAfterCurrent === "number"
        ? Math.max(0, d.skippedAfterCurrent)
        : 0,
  };
}

function parseDeckVolume(raw: unknown): Record<DeckId, number> {
  if (!raw || typeof raw !== "object") {
    return { A: 1, B: 1 };
  }
  const v = raw as Record<string, unknown>;
  return {
    A:
      typeof v.A === "number" && Number.isFinite(v.A)
        ? Math.max(0, Math.min(1, v.A))
        : 1,
    B:
      typeof v.B === "number" && Number.isFinite(v.B)
        ? Math.max(0, Math.min(1, v.B))
        : 1,
  };
}

function parseDeckCrossfade(raw: unknown): Record<DeckId, number> {
  if (!raw || typeof raw !== "object") {
    return { A: 0, B: 0 };
  }
  const v = raw as Record<string, unknown>;
  return {
    A:
      typeof v.A === "number" && Number.isFinite(v.A)
        ? clampCrossfadeSeconds(v.A)
        : 0,
    B:
      typeof v.B === "number" && Number.isFinite(v.B)
        ? clampCrossfadeSeconds(v.B)
        : 0,
  };
}

function parseHighlightIndex(raw: unknown): Record<DeckId, number | null> {
  if (!raw || typeof raw !== "object") {
    return { A: null, B: null };
  }
  const v = raw as Record<string, unknown>;
  return {
    A: typeof v.A === "number" ? v.A : null,
    B: typeof v.B === "number" ? v.B : null,
  };
}

export function normalizeDjDeckState(raw: DjDeckState): DjDeckState {
  return {
    deckA: parseDeckState(raw.deckA, "A"),
    deckB: parseDeckState(raw.deckB, "B"),
    secondDeckEnabled: raw.secondDeckEnabled === true,
    activeDeck: raw.activeDeck === "B" ? "B" : "A",
    deckVolume: parseDeckVolume(raw.deckVolume),
    deckCrossfadeSeconds: parseDeckCrossfade(raw.deckCrossfadeSeconds),
    masterVolume:
      typeof raw.masterVolume === "number" && Number.isFinite(raw.masterVolume)
        ? Math.max(0, Math.min(1, raw.masterVolume))
        : 1,
    highlightedQueueIndex: parseHighlightIndex(raw.highlightedQueueIndex),
    highlightedPlaylistIndex: parseHighlightIndex(raw.highlightedPlaylistIndex),
  };
}

export function serializeDjDeckState(state: DjDeckState): DjDeckState {
  return normalizeDjDeckState(state);
}

export function deserializeDjDeckState(raw: unknown): DjDeckState {
  if (!raw || typeof raw !== "object") {
    return INITIAL_DJ_DECK_STATE;
  }
  return normalizeDjDeckState(raw as DjDeckState);
}
