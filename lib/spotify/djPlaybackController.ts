import type { RemoteDeckAction } from "@/lib/spotify/djDeckActionWire";
import type { DeckId } from "@/lib/spotify/djDeckState";
import type { DjSessionCommand } from "@/lib/spotify/djSessionCommands";

export type DjPlaybackHandlers = {
  playDeck: (deck: DeckId) => Promise<void>;
  pauseActive: () => Promise<void>;
  advanceTrack: (deck: DeckId, autoPlay: boolean) => Promise<void>;
  previousTrack: (deck: DeckId) => Promise<void>;
  restartTrack: (deck: DeckId) => Promise<void>;
  switchActiveDeck: (deck: DeckId) => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  playFromPlaylistRow: (deck: DeckId, index: number) => Promise<void>;
  playFromQueueRow: (deck: DeckId, index: number) => Promise<void>;
  startQueueHead: (deck: DeckId, queueIndex: number) => Promise<void>;
  dispatchDeckAction: (action: RemoteDeckAction) => Promise<void>;
};

export async function executeSessionCommand(
  command: DjSessionCommand,
  handlers: DjPlaybackHandlers
): Promise<void> {
  switch (command.type) {
    case "PLAY_DECK":
      await handlers.playDeck(command.deck);
      break;
    case "PAUSE":
      await handlers.pauseActive();
      break;
    case "ADVANCE_TRACK":
      await handlers.advanceTrack(command.deck, command.autoPlay);
      break;
    case "PREVIOUS_TRACK":
      await handlers.previousTrack(command.deck);
      break;
    case "RESTART_TRACK":
      await handlers.restartTrack(command.deck);
      break;
    case "SWITCH_ACTIVE_DECK":
      await handlers.switchActiveDeck(command.deck);
      break;
    case "SEEK":
      await handlers.seek(command.positionMs);
      break;
    case "PLAY_PLAYLIST_INDEX":
      await handlers.playFromPlaylistRow(command.deck, command.index);
      break;
    case "PLAY_QUEUE_INDEX":
      await handlers.playFromQueueRow(command.deck, command.index);
      break;
    case "START_QUEUE_HEAD":
      await handlers.startQueueHead(command.deck, command.queueIndex);
      break;
    case "DISPATCH_DECK_ACTION":
      await handlers.dispatchDeckAction(command.action);
      break;
    default:
      break;
  }
}

export function createPauseActiveHandler(
  getActiveDeck: () => DeckId,
  playDeck: (deck: DeckId) => Promise<void>,
  isPlaying: () => boolean
): () => Promise<void> {
  return async () => {
    if (!isPlaying()) return;
    await playDeck(getActiveDeck());
  };
}
