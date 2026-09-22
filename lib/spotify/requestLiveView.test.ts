import { describe, expect, it } from "vitest";
import {
  INITIAL_DJ_DECK_STATE,
  serializeDjDeckState,
} from "@/lib/spotify/djDeckState";
import type { DjSessionRow } from "@/lib/spotify/djSession";
import {
  buildLivePlaylistViewFromSession,
  isTrackOnDeck,
} from "@/lib/spotify/requestLiveView";

function sessionWithDeck(deckState = INITIAL_DJ_DECK_STATE): DjSessionRow {
  return {
    id: "sess-1",
    status: "active",
    started_by: "user",
    started_at: new Date().toISOString(),
    ended_at: null,
    host_client_id: "client",
    host_device_id: "device",
    host_status: "online",
    host_last_seen_at: new Date().toISOString(),
    deck_state: serializeDjDeckState({
      ...deckState,
      deckA: {
        ...deckState.deckA,
        playlistId: "social-pl",
        playlist: [
          {
            id: "on-deck",
            uri: "spotify:track:on-deck",
            name: "On Deck",
            primaryArtist: "Artist",
            durationMs: 180000,
          },
        ],
        track: {
          id: "on-deck",
          uri: "spotify:track:on-deck",
          name: "On Deck",
          primaryArtist: "Artist",
          durationMs: 180000,
        },
        playlistIndex: 0,
      },
    }),
    playback_snapshot: {
      isPlaying: true,
      positionMs: 0,
      currentTrackUri: "spotify:track:on-deck",
      activeDeck: "A",
      updatedAt: new Date().toISOString(),
    },
    state_version: 1,
    updated_at: new Date().toISOString(),
  };
}

describe("buildLivePlaylistViewFromSession", () => {
  it("uses social deck when playlist id matches", () => {
    const view = buildLivePlaylistViewFromSession(sessionWithDeck(), "social-pl");
    expect(view.deckAuthority).toBe("social_deck");
    expect(view.currentTrackId).toBe("on-deck");
    expect(isTrackOnDeck(view, "on-deck")).toBe(true);
    expect(isTrackOnDeck(view, "ghost")).toBe(false);
  });

  it("returns no authority when neither deck uses social playlist", () => {
    const base = sessionWithDeck();
    const deckState = {
      ...INITIAL_DJ_DECK_STATE,
      deckA: {
        ...INITIAL_DJ_DECK_STATE.deckA,
        playlistId: "other-pl",
      },
    };
    const session: DjSessionRow = {
      ...base,
      deck_state: serializeDjDeckState(deckState),
    };
    const view = buildLivePlaylistViewFromSession(session, "social-pl");
    expect(view.deckAuthority).toBe("none");
  });

  it("uses social deck when inactive deck holds social playlist", () => {
    const base = sessionWithDeck();
    const deckState = serializeDjDeckState({
      ...INITIAL_DJ_DECK_STATE,
      deckA: {
        ...INITIAL_DJ_DECK_STATE.deckA,
        playlistId: "other-pl",
      },
      deckB: {
        ...INITIAL_DJ_DECK_STATE.deckB,
        playlistId: "social-pl",
        playlist: [
          {
            id: "on-deck",
            uri: "spotify:track:on-deck",
            name: "On Deck",
            primaryArtist: "Artist",
            durationMs: 180000,
          },
        ],
      },
    });
    const session: DjSessionRow = {
      ...base,
      deck_state: deckState,
    };
    const view = buildLivePlaylistViewFromSession(session, "social-pl");
    expect(view.deckAuthority).toBe("social_deck");
  });
});
