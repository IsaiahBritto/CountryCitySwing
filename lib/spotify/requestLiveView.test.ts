import { describe, expect, it } from "vitest";
import {
  djDeckReducer,
  INITIAL_DJ_DECK_STATE,
  serializeDjDeckState,
} from "@/lib/spotify/djDeckState";
import type { DjSessionRow } from "@/lib/spotify/djSession";
import {
  buildLivePlaylistViewFromSession,
  deckRowStatusForTrack,
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
    expect(view.socialDeck).toBe("A");
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
    expect(view.socialDeck).toBe("B");
  });

  it("uses social deck playhead when host plays the other deck", () => {
    const socialTrackId = "social-at-20";
    const playlist = Array.from({ length: 21 }, (_, i) => ({
      id: i === 20 ? socialTrackId : `track-${i}`,
      uri: `spotify:track:${i === 20 ? socialTrackId : `track-${i}`}`,
      name: `Song ${i}`,
      primaryArtist: "Artist",
      durationMs: 180000,
    }));

    let deckState = djDeckReducer(INITIAL_DJ_DECK_STATE, {
      type: "SELECT_PLAYLIST",
      deck: "A",
      playlistId: "social-pl",
      playlistName: "Social",
    });
    deckState = djDeckReducer(deckState, {
      type: "SET_PLAYLIST",
      deck: "A",
      playlist,
      playlistTotalDurationMs: playlist.length * 180000,
    });
    deckState = djDeckReducer(deckState, {
      type: "SET_PLAYLIST_INDEX",
      deck: "A",
      index: 20,
    });
    deckState = djDeckReducer(deckState, {
      type: "SELECT_PLAYLIST",
      deck: "B",
      playlistId: "other-pl",
      playlistName: "Other",
    });
    deckState = djDeckReducer(deckState, {
      type: "SET_PLAYLIST",
      deck: "B",
      playlist: [
        {
          id: "b-playing",
          uri: "spotify:track:b-playing",
          name: "B Side",
          primaryArtist: "Artist",
          durationMs: 180000,
        },
      ],
      playlistTotalDurationMs: 180000,
    });
    deckState = djDeckReducer(deckState, {
      type: "SET_PLAYLIST_INDEX",
      deck: "B",
      index: 0,
    });
    deckState = djDeckReducer(deckState, { type: "SET_ACTIVE_DECK", deck: "B" });

    const session: DjSessionRow = {
      ...sessionWithDeck(),
      deck_state: serializeDjDeckState(deckState),
      playback_snapshot: {
        isPlaying: true,
        positionMs: 0,
        currentTrackUri: "spotify:track:b-playing",
        activeDeck: "B",
        updatedAt: new Date().toISOString(),
      },
    };

    const view = buildLivePlaylistViewFromSession(session, "social-pl");
    expect(view.socialDeck).toBe("A");
    expect(view.activeDeck).toBe("B");
    expect(view.currentTrackId).toBe(socialTrackId);
    expect(isTrackOnDeck(view, socialTrackId)).toBe(true);
    expect(isTrackOnDeck(view, "b-playing")).toBe(false);
    expect(deckRowStatusForTrack(view, socialTrackId)).toBe("current");
  });
});
