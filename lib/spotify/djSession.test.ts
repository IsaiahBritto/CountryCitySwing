import { describe, expect, it } from "vitest";
import {
  createEmptyPlaybackSnapshot,
  canExecutePlayback,
  effectiveHostStatus,
  inferSessionRole,
  isHostStale,
  parsePlaybackSnapshot,
  toSessionResponse,
  type DjSessionRow,
} from "@/lib/spotify/djSession";
import { INITIAL_DJ_DECK_STATE } from "@/lib/spotify/djDeckState";

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

describe("djSession helpers", () => {
  it("parses playback snapshot safely", () => {
    expect(parsePlaybackSnapshot(null)).toMatchObject({
      isPlaying: false,
      positionMs: 0,
      currentTrackUri: null,
      activeDeck: "A",
    });
    expect(
      parsePlaybackSnapshot({
        isPlaying: true,
        positionMs: 1200,
        currentTrackUri: "spotify:track:abc",
        activeDeck: "B",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    ).toMatchObject({
      isPlaying: true,
      positionMs: 1200,
      currentTrackUri: "spotify:track:abc",
      activeDeck: "B",
    });
  });

  it("infers host vs controller role", () => {
    const session = makeSessionRow({ host_client_id: "host-client" });
    expect(inferSessionRole(session, "host-client")).toBe("host");
    expect(inferSessionRole(session, "other-client")).toBe("controller");
    expect(inferSessionRole(null, "any")).toBe("idle");
  });

  it("marks stale hosts offline", () => {
    const now = Date.parse("2026-01-01T00:00:30.000Z");
    expect(
      isHostStale("2026-01-01T00:00:00.000Z", now)
    ).toBe(true);
    expect(
      isHostStale("2026-01-01T00:00:20.000Z", now)
    ).toBe(false);
  });

  it("computes effective host status", () => {
    const online = makeSessionRow({
      host_status: "online",
      host_last_seen_at: new Date().toISOString(),
    });
    expect(effectiveHostStatus(online)).toBe("online");

    const stale = makeSessionRow({
      host_status: "online",
      host_last_seen_at: "2020-01-01T00:00:00.000Z",
    });
    expect(effectiveHostStatus(stale)).toBe("offline");
  });

  it("toSessionResponse uses read-only effective host status", () => {
    const stale = makeSessionRow({
      host_status: "online",
      host_last_seen_at: "2020-01-01T00:00:00.000Z",
    });
    const response = toSessionResponse(stale);
    expect(response.hostStatus).toBe("offline");
  });

  it("canExecutePlayback requires online effective status and device id", () => {
    const online = makeSessionRow({
      host_status: "online",
      host_last_seen_at: new Date().toISOString(),
      host_device_id: "device-1",
    });
    expect(canExecutePlayback(online)).toBe(true);

    const stale = makeSessionRow({
      host_status: "online",
      host_last_seen_at: "2020-01-01T00:00:00.000Z",
      host_device_id: "device-1",
    });
    expect(canExecutePlayback(stale)).toBe(false);

    const noDevice = makeSessionRow({
      host_status: "online",
      host_last_seen_at: new Date().toISOString(),
      host_device_id: null,
    });
    expect(canExecutePlayback(noDevice)).toBe(false);
  });
});
