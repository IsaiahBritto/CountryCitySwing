import { describe, expect, it } from "vitest";
import { INITIAL_DJ_DECK_STATE } from "@/lib/spotify/djDeckState";
import {
  createEmptyPlaybackSnapshot,
  toSessionResponse,
  type DjSessionRow,
} from "@/lib/spotify/djSession";
import {
  deckStateContentHash,
  deckStatesEqual,
  mergeSessionMetadata,
  shouldSkipDeckRestore,
} from "@/lib/spotify/djSessionSync";

function makeSessionRow(overrides: Partial<DjSessionRow> = {}): DjSessionRow {
  return {
    id: "sess-1",
    status: "active",
    started_by: "user-1",
    started_at: new Date().toISOString(),
    ended_at: null,
    host_client_id: "host-client",
    host_device_id: "device-1",
    host_status: "online",
    host_last_seen_at: new Date().toISOString(),
    deck_state: INITIAL_DJ_DECK_STATE,
    playback_snapshot: createEmptyPlaybackSnapshot(),
    state_version: 1,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("djSessionSync", () => {
  it("hashes deck state consistently", () => {
    const hashA = deckStateContentHash(INITIAL_DJ_DECK_STATE);
    const hashB = deckStateContentHash(INITIAL_DJ_DECK_STATE);
    expect(hashA).toBe(hashB);
    expect(deckStatesEqual(INITIAL_DJ_DECK_STATE, INITIAL_DJ_DECK_STATE)).toBe(
      true
    );
  });

  it("merges session metadata without replacing deck state", () => {
    const current = toSessionResponse(makeSessionRow({ state_version: 2 }));
    const incoming = toSessionResponse(
      makeSessionRow({
        state_version: 3,
        host_status: "offline",
        playback_snapshot: {
          isPlaying: true,
          positionMs: 5000,
          currentTrackUri: "spotify:track:abc",
          activeDeck: "A",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    const merged = mergeSessionMetadata(current, incoming);
    expect(merged.stateVersion).toBe(3);
    expect(merged.hostStatus).toBe("offline");
    expect(merged.playbackSnapshot.positionMs).toBe(5000);
    expect(merged.deckState).toEqual(current.deckState);
  });

  it("skips deck restore when hashes match", () => {
    const incoming = toSessionResponse(makeSessionRow({ state_version: 4 }));
    expect(
      shouldSkipDeckRestore(incoming, INITIAL_DJ_DECK_STATE)
    ).toBe(true);
  });

  it("skips deck restore when host guard rejects incoming", () => {
    const incoming = toSessionResponse(
      makeSessionRow({
        state_version: 4,
        deck_state: {
          ...INITIAL_DJ_DECK_STATE,
          masterVolume: 0.25,
        },
      })
    );

    expect(
      shouldSkipDeckRestore(
        incoming,
        INITIAL_DJ_DECK_STATE,
        () => false,
        toSessionResponse(makeSessionRow())
      )
    ).toBe(true);
  });

  it("allows deck restore when content differs and guard passes", () => {
    const incoming = toSessionResponse(
      makeSessionRow({
        state_version: 4,
        deck_state: {
          ...INITIAL_DJ_DECK_STATE,
          masterVolume: 0.25,
        },
      })
    );

    expect(
      shouldSkipDeckRestore(incoming, INITIAL_DJ_DECK_STATE, () => true)
    ).toBe(false);
  });

  it("skips deck restore when guard rejects URI mismatch while paused", () => {
    const incoming = toSessionResponse(
      makeSessionRow({
        state_version: 4,
        deck_state: {
          ...INITIAL_DJ_DECK_STATE,
          deckA: {
            ...INITIAL_DJ_DECK_STATE.deckA,
            track: {
              id: "t-other",
              uri: "spotify:track:other",
              name: "Other",
              primaryArtist: "Artist",
              durationMs: 180000,
            },
          },
        },
      })
    );

    expect(
      shouldSkipDeckRestore(
        incoming,
        INITIAL_DJ_DECK_STATE,
        () => false,
        toSessionResponse(makeSessionRow())
      )
    ).toBe(true);
  });
});
