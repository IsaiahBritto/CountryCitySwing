export type DeckId = "A" | "B";

export type DeckTrack = {
  id: string;
  uri: string;
  name: string;
  primaryArtist: string;
  durationMs: number;
  bpm?: number;
};

export type DeckSlot = {
  track: DeckTrack | null;
  queueIndex: number | null;
};

export type DjDeckState = {
  selectedPlaylistId: string | null;
  selectedPlaylistName: string | null;
  queue: DeckTrack[];
  totalDurationMs: number;
  queueCursor: number;
  deckA: DeckSlot;
  deckB: DeckSlot;
  activeDeck: DeckId;
  crossfader: number;
  deckVolume: Record<DeckId, number>;
  masterVolume: number;
  fadeMs: number;
  isTransitioning: boolean;
  automixEnabled: boolean;
  highlightedQueueIndex: number | null;
};

export type DjDeckAction =
  | {
      type: "SELECT_PLAYLIST";
      playlistId: string;
      playlistName: string;
    }
  | {
      type: "SET_QUEUE";
      queue: DeckTrack[];
      totalDurationMs: number;
    }
  | { type: "LOAD_TO_DECK"; deck: DeckId; track: DeckTrack; queueIndex: number }
  | { type: "SET_ACTIVE_DECK"; deck: DeckId }
  | { type: "SET_CROSSFADER"; value: number }
  | { type: "SET_DECK_VOLUME"; deck: DeckId; value: number }
  | { type: "SET_MASTER_VOLUME"; value: number }
  | { type: "SET_FADE_MS"; value: number }
  | { type: "SET_TRANSITIONING"; value: boolean }
  | { type: "SET_AUTOMIX"; value: boolean }
  | { type: "HIGHLIGHT_QUEUE_ROW"; index: number | null }
  | { type: "ADVANCE_AFTER_TRANSITION" };

export const INITIAL_DJ_DECK_STATE: DjDeckState = {
  selectedPlaylistId: null,
  selectedPlaylistName: null,
  queue: [],
  totalDurationMs: 0,
  queueCursor: 0,
  deckA: { track: null, queueIndex: null },
  deckB: { track: null, queueIndex: null },
  activeDeck: "A",
  crossfader: 0,
  deckVolume: { A: 1, B: 1 },
  masterVolume: 1,
  fadeMs: 3000,
  isTransitioning: false,
  automixEnabled: false,
  highlightedQueueIndex: null,
};

function emptyDeckSlot(): DeckSlot {
  return { track: null, queueIndex: null };
}

function clampFadeMs(value: number): number {
  return Math.max(500, Math.min(15000, value));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function djDeckReducer(
  state: DjDeckState,
  action: DjDeckAction
): DjDeckState {
  switch (action.type) {
    case "SELECT_PLAYLIST":
      return {
        ...INITIAL_DJ_DECK_STATE,
        selectedPlaylistId: action.playlistId,
        selectedPlaylistName: action.playlistName,
      };
    case "SET_QUEUE": {
      const queue = action.queue;
      const deckA: DeckSlot =
        queue[0] != null
          ? { track: queue[0], queueIndex: 0 }
          : emptyDeckSlot();
      const deckB: DeckSlot =
        queue[1] != null
          ? { track: queue[1], queueIndex: 1 }
          : emptyDeckSlot();
      return {
        ...state,
        queue,
        totalDurationMs: action.totalDurationMs,
        queueCursor: 0,
        deckA,
        deckB,
        activeDeck: "A",
        crossfader: 0,
        highlightedQueueIndex: queue.length > 0 ? 0 : null,
      };
    }
    case "LOAD_TO_DECK": {
      const slot: DeckSlot = {
        track: action.track,
        queueIndex: action.queueIndex,
      };
      return action.deck === "A"
        ? { ...state, deckA: slot }
        : { ...state, deckB: slot };
    }
    case "SET_ACTIVE_DECK":
      return { ...state, activeDeck: action.deck };
    case "SET_CROSSFADER":
      return {
        ...state,
        crossfader: Math.max(0, Math.min(100, action.value)),
      };
    case "SET_DECK_VOLUME":
      return {
        ...state,
        deckVolume: {
          ...state.deckVolume,
          [action.deck]: clampUnit(action.value),
        },
      };
    case "SET_MASTER_VOLUME":
      return { ...state, masterVolume: clampUnit(action.value) };
    case "SET_FADE_MS":
      return { ...state, fadeMs: clampFadeMs(action.value) };
    case "SET_TRANSITIONING":
      return { ...state, isTransitioning: action.value };
    case "SET_AUTOMIX":
      return { ...state, automixEnabled: action.value };
    case "HIGHLIGHT_QUEUE_ROW":
      return { ...state, highlightedQueueIndex: action.index };
    case "ADVANCE_AFTER_TRANSITION": {
      const oldActive = state.activeDeck;
      const newActive = oldActive === "A" ? "B" : "A";
      const nextCursor = Math.max(
        state.queueCursor,
        getDeckSlot(state, newActive).queueIndex ?? state.queueCursor
      );
      const preloadIndex = nextCursor + 1;
      const preloadTrack = state.queue[preloadIndex] ?? null;
      const outgoingSlot: DeckSlot = preloadTrack
        ? { track: preloadTrack, queueIndex: preloadIndex }
        : emptyDeckSlot();

      return {
        ...state,
        activeDeck: newActive,
        queueCursor: nextCursor,
        crossfader: newActive === "A" ? 0 : 100,
        ...(oldActive === "A"
          ? { deckA: outgoingSlot }
          : { deckB: outgoingSlot }),
      };
    }
    default:
      return state;
  }
}

export function getDeckSlot(state: DjDeckState, deck: DeckId): DeckSlot {
  return deck === "A" ? state.deckA : state.deckB;
}

export function getIncomingDeck(activeDeck: DeckId): DeckId {
  return activeDeck === "A" ? "B" : "A";
}

export function getNowPlaying(state: DjDeckState): DeckTrack | null {
  return getDeckSlot(state, state.activeDeck).track;
}

export function getNextUp(state: DjDeckState): DeckTrack | null {
  const incoming = getIncomingDeck(state.activeDeck);
  const incomingTrack = getDeckSlot(state, incoming).track;
  if (incomingTrack) return incomingTrack;
  const nextIndex = state.queueCursor + 1;
  return state.queue[nextIndex] ?? null;
}

export type QueueRowStatus = "played" | "current" | "next" | "upcoming";

export function queueRowStatus(
  state: DjDeckState,
  index: number
): QueueRowStatus {
  const activeIndex = getDeckSlot(state, state.activeDeck).queueIndex;
  const incomingIndex = getDeckSlot(
    state,
    getIncomingDeck(state.activeDeck)
  ).queueIndex;

  if (activeIndex === index) return "current";
  if (incomingIndex === index) return "next";
  if (
    activeIndex != null &&
    incomingIndex != null &&
    index < Math.min(activeIndex, incomingIndex)
  ) {
    return "played";
  }
  if (activeIndex != null && index < activeIndex) return "played";
  return "upcoming";
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
