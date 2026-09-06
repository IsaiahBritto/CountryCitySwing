import { describe, expect, it, vi } from "vitest";
import {
  executeSessionCommand,
  type DjPlaybackHandlers,
} from "@/lib/spotify/djPlaybackController";

function makeHandlers(
  overrides: Partial<DjPlaybackHandlers> = {}
): DjPlaybackHandlers {
  return {
    playDeck: vi.fn(),
    pauseActive: vi.fn(),
    advanceTrack: vi.fn(),
    previousTrack: vi.fn(),
    restartTrack: vi.fn(),
    switchActiveDeck: vi.fn(),
    seek: vi.fn(),
    playFromPlaylistRow: vi.fn(),
    playFromQueueRow: vi.fn(),
    startQueueHead: vi.fn(),
    dispatchDeckAction: vi.fn(),
    ...overrides,
  };
}

describe("executeSessionCommand", () => {
  it("dispatches deck action commands to handler", async () => {
    const handlers = makeHandlers();
    await executeSessionCommand(
      {
        type: "DISPATCH_DECK_ACTION",
        action: { type: "SET_MASTER_VOLUME", value: 0.5 },
      },
      handlers
    );
    expect(handlers.dispatchDeckAction).toHaveBeenCalledWith({
      type: "SET_MASTER_VOLUME",
      value: 0.5,
    });
  });
});
