import { randomId } from "@/lib/randomId";
import type { DeckId } from "@/lib/spotify/djDeckState";

export type DjSessionCommand =
  | { type: "PLAY_DECK"; deck: DeckId }
  | { type: "PAUSE" }
  | { type: "ADVANCE_TRACK"; deck: DeckId; autoPlay: boolean }
  | { type: "PREVIOUS_TRACK"; deck: DeckId }
  | { type: "RESTART_TRACK"; deck: DeckId }
  | { type: "SWITCH_ACTIVE_DECK"; deck: DeckId }
  | { type: "SEEK"; positionMs: number }
  | { type: "PLAY_PLAYLIST_INDEX"; deck: DeckId; index: number }
  | { type: "PLAY_QUEUE_INDEX"; deck: DeckId; index: number }
  | { type: "START_QUEUE_HEAD"; deck: DeckId; queueIndex: number };

const COMMAND_TYPES = new Set([
  "PLAY_DECK",
  "PAUSE",
  "ADVANCE_TRACK",
  "PREVIOUS_TRACK",
  "RESTART_TRACK",
  "SWITCH_ACTIVE_DECK",
  "SEEK",
  "PLAY_PLAYLIST_INDEX",
  "PLAY_QUEUE_INDEX",
  "START_QUEUE_HEAD",
]);

function isDeckId(value: unknown): value is DeckId {
  return value === "A" || value === "B";
}

export function parseDjSessionCommand(raw: unknown): DjSessionCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string" || !COMMAND_TYPES.has(o.type)) return null;

  switch (o.type) {
    case "PLAY_DECK":
      return isDeckId(o.deck) ? { type: "PLAY_DECK", deck: o.deck } : null;
    case "PAUSE":
      return { type: "PAUSE" };
    case "ADVANCE_TRACK":
      return isDeckId(o.deck) && typeof o.autoPlay === "boolean"
        ? { type: "ADVANCE_TRACK", deck: o.deck, autoPlay: o.autoPlay }
        : null;
    case "PREVIOUS_TRACK":
      return isDeckId(o.deck)
        ? { type: "PREVIOUS_TRACK", deck: o.deck }
        : null;
    case "RESTART_TRACK":
      return isDeckId(o.deck)
        ? { type: "RESTART_TRACK", deck: o.deck }
        : null;
    case "SWITCH_ACTIVE_DECK":
      return isDeckId(o.deck)
        ? { type: "SWITCH_ACTIVE_DECK", deck: o.deck }
        : null;
    case "SEEK":
      return typeof o.positionMs === "number" &&
        Number.isFinite(o.positionMs) &&
        o.positionMs >= 0
        ? { type: "SEEK", positionMs: Math.max(0, o.positionMs) }
        : null;
    case "PLAY_PLAYLIST_INDEX":
      return isDeckId(o.deck) &&
        typeof o.index === "number" &&
        Number.isInteger(o.index)
        ? { type: "PLAY_PLAYLIST_INDEX", deck: o.deck, index: o.index }
        : null;
    case "PLAY_QUEUE_INDEX":
      return isDeckId(o.deck) &&
        typeof o.index === "number" &&
        Number.isInteger(o.index)
        ? { type: "PLAY_QUEUE_INDEX", deck: o.deck, index: o.index }
        : null;
    case "START_QUEUE_HEAD":
      return isDeckId(o.deck) &&
        typeof o.queueIndex === "number" &&
        Number.isInteger(o.queueIndex)
        ? {
            type: "START_QUEUE_HEAD",
            deck: o.deck,
            queueIndex: o.queueIndex,
          }
        : null;
    default:
      return null;
  }
}

export type DjSessionCommandBroadcast = {
  command: DjSessionCommand;
  commandId: string;
  clientId: string;
  issuedAt: string;
};

export function createCommandBroadcast(
  command: DjSessionCommand,
  clientId: string
): DjSessionCommandBroadcast {
  return {
    command,
    commandId: randomId(),
    clientId,
    issuedAt: new Date().toISOString(),
  };
}
