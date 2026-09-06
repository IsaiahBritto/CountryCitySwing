import type {
  AfterQueueBehavior,
  DeckId,
  DeckTrack,
  DjDeckAction,
} from "@/lib/spotify/djDeckState";

const REMOTE_ACTION_TYPES = new Set([
  "SET_DECK_VOLUME",
  "SET_MASTER_VOLUME",
  "SET_DECK_CROSSFADE",
  "ADD_TO_PLAY_QUEUE",
  "REMOVE_FROM_PLAY_QUEUE",
  "MOVE_PLAY_QUEUE_ITEM",
  "CLEAR_PLAY_QUEUE",
  "SET_AFTER_QUEUE_BEHAVIOR",
  "SET_AFTER_QUEUE_CONTINUE_DECK",
  "SKIP_UP_NEXT",
  "SELECT_PLAYLIST",
  "SET_PLAYLIST",
  "ENABLE_SECOND_DECK",
  "DISABLE_SECOND_DECK",
]);

export type RemoteDeckAction =
  | { type: "ENABLE_SECOND_DECK" }
  | { type: "DISABLE_SECOND_DECK" }
  | { type: "SET_MASTER_VOLUME"; value: number }
  | { type: "SET_DECK_VOLUME"; deck: DeckId; value: number }
  | { type: "SET_DECK_CROSSFADE"; deck: DeckId; seconds: number }
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
  | { type: "ADD_TO_PLAY_QUEUE"; deck: DeckId; track: DeckTrack }
  | { type: "REMOVE_FROM_PLAY_QUEUE"; deck: DeckId; index: number }
  | {
      type: "MOVE_PLAY_QUEUE_ITEM";
      deck: DeckId;
      fromIndex: number;
      toIndex: number;
    }
  | { type: "CLEAR_PLAY_QUEUE"; deck: DeckId }
  | {
      type: "SET_AFTER_QUEUE_BEHAVIOR";
      deck: DeckId;
      behavior: AfterQueueBehavior;
    }
  | {
      type: "SET_AFTER_QUEUE_CONTINUE_DECK";
      deck: DeckId;
      targetDeck: DeckId;
    }
  | { type: "SKIP_UP_NEXT"; deck: DeckId };

function isDeckId(value: unknown): value is DeckId {
  return value === "A" || value === "B";
}

function isAfterQueueBehavior(value: unknown): value is AfterQueueBehavior {
  return value === "continue" || value === "stop";
}

function parseDeckTrack(raw: unknown): DeckTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  if (typeof o.uri !== "string" || !o.uri.trim()) return null;
  if (typeof o.name !== "string") return null;
  if (typeof o.primaryArtist !== "string") return null;
  if (typeof o.durationMs !== "number" || !Number.isFinite(o.durationMs)) {
    return null;
  }
  const track: DeckTrack = {
    id: o.id.trim(),
    uri: o.uri.trim(),
    name: o.name,
    primaryArtist: o.primaryArtist,
    durationMs: Math.max(0, o.durationMs),
  };
  if (typeof o.bpm === "number" && Number.isFinite(o.bpm)) {
    track.bpm = o.bpm;
  }
  return track;
}

function parseDeckTrackList(raw: unknown): DeckTrack[] | null {
  if (!Array.isArray(raw)) return null;
  const tracks: DeckTrack[] = [];
  for (const item of raw) {
    const track = parseDeckTrack(item);
    if (!track) return null;
    tracks.push(track);
  }
  return tracks;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampCrossfadeSeconds(value: number): number {
  return Math.max(0, Math.min(30, value));
}

export function isRemoteDeckAction(action: DjDeckAction): action is RemoteDeckAction {
  return REMOTE_ACTION_TYPES.has(action.type);
}

export function isDebouncedRemoteDeckAction(action: RemoteDeckAction): boolean {
  return (
    action.type === "SET_DECK_VOLUME" ||
    action.type === "SET_MASTER_VOLUME" ||
    action.type === "SET_DECK_CROSSFADE"
  );
}

export function parseRemoteDeckAction(raw: unknown): RemoteDeckAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string" || !REMOTE_ACTION_TYPES.has(o.type)) {
    return null;
  }

  switch (o.type) {
    case "ENABLE_SECOND_DECK":
      return { type: "ENABLE_SECOND_DECK" };
    case "DISABLE_SECOND_DECK":
      return { type: "DISABLE_SECOND_DECK" };
    case "SET_MASTER_VOLUME":
      return typeof o.value === "number" && Number.isFinite(o.value)
        ? { type: "SET_MASTER_VOLUME", value: clampUnit(o.value) }
        : null;
    case "SET_DECK_VOLUME":
      return isDeckId(o.deck) &&
        typeof o.value === "number" &&
        Number.isFinite(o.value)
        ? { type: "SET_DECK_VOLUME", deck: o.deck, value: clampUnit(o.value) }
        : null;
    case "SET_DECK_CROSSFADE":
      return isDeckId(o.deck) &&
        typeof o.seconds === "number" &&
        Number.isFinite(o.seconds)
        ? {
            type: "SET_DECK_CROSSFADE",
            deck: o.deck,
            seconds: clampCrossfadeSeconds(o.seconds),
          }
        : null;
    case "SELECT_PLAYLIST":
      return isDeckId(o.deck) &&
        typeof o.playlistId === "string" &&
        o.playlistId.trim() &&
        typeof o.playlistName === "string"
        ? {
            type: "SELECT_PLAYLIST",
            deck: o.deck,
            playlistId: o.playlistId.trim(),
            playlistName: o.playlistName,
          }
        : null;
    case "SET_PLAYLIST": {
      const playlist = parseDeckTrackList(o.playlist);
      if (
        !isDeckId(o.deck) ||
        !playlist ||
        typeof o.playlistTotalDurationMs !== "number" ||
        !Number.isFinite(o.playlistTotalDurationMs)
      ) {
        return null;
      }
      return {
        type: "SET_PLAYLIST",
        deck: o.deck,
        playlist,
        playlistTotalDurationMs: Math.max(0, o.playlistTotalDurationMs),
      };
    }
    case "ADD_TO_PLAY_QUEUE": {
      const track = parseDeckTrack(o.track);
      return isDeckId(o.deck) && track
        ? { type: "ADD_TO_PLAY_QUEUE", deck: o.deck, track }
        : null;
    }
    case "REMOVE_FROM_PLAY_QUEUE":
      return isDeckId(o.deck) &&
        typeof o.index === "number" &&
        Number.isInteger(o.index) &&
        o.index >= 0
        ? { type: "REMOVE_FROM_PLAY_QUEUE", deck: o.deck, index: o.index }
        : null;
    case "MOVE_PLAY_QUEUE_ITEM":
      return isDeckId(o.deck) &&
        typeof o.fromIndex === "number" &&
        Number.isInteger(o.fromIndex) &&
        o.fromIndex >= 0 &&
        typeof o.toIndex === "number" &&
        Number.isInteger(o.toIndex) &&
        o.toIndex >= 0
        ? {
            type: "MOVE_PLAY_QUEUE_ITEM",
            deck: o.deck,
            fromIndex: o.fromIndex,
            toIndex: o.toIndex,
          }
        : null;
    case "CLEAR_PLAY_QUEUE":
      return isDeckId(o.deck)
        ? { type: "CLEAR_PLAY_QUEUE", deck: o.deck }
        : null;
    case "SET_AFTER_QUEUE_BEHAVIOR":
      return isDeckId(o.deck) && isAfterQueueBehavior(o.behavior)
        ? {
            type: "SET_AFTER_QUEUE_BEHAVIOR",
            deck: o.deck,
            behavior: o.behavior,
          }
        : null;
    case "SET_AFTER_QUEUE_CONTINUE_DECK":
      return isDeckId(o.deck) && isDeckId(o.targetDeck)
        ? {
            type: "SET_AFTER_QUEUE_CONTINUE_DECK",
            deck: o.deck,
            targetDeck: o.targetDeck,
          }
        : null;
    case "SKIP_UP_NEXT":
      return isDeckId(o.deck)
        ? { type: "SKIP_UP_NEXT", deck: o.deck }
        : null;
    default:
      return null;
  }
}
