import { describe, expect, it } from "vitest";
import { INITIAL_DJ_DECK_STATE } from "@/lib/spotify/djDeckState";
import {
  shouldApplyPersistResponse,
  shouldFullRestoreOnJoin,
  shouldIgnoreOwnPersistEcho,
} from "@/lib/spotify/djSessionSync";

describe("useDjSession join helpers", () => {
  it("requires full restore on first join", () => {
    expect(shouldFullRestoreOnJoin(null, "sess-1")).toBe(true);
  });

  it("requires full restore when session id changes", () => {
    expect(shouldFullRestoreOnJoin("sess-1", "sess-2")).toBe(true);
  });

  it("skips full restore when re-joining same session", () => {
    expect(shouldFullRestoreOnJoin("sess-1", "sess-1")).toBe(false);
  });
});

describe("persist response helpers", () => {
  it("accepts response when deck hash unchanged during flight", () => {
    expect(
      shouldApplyPersistResponse(
        JSON.stringify(INITIAL_DJ_DECK_STATE),
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(true);
  });

  it("rejects response when deck changed during flight", () => {
    const hashAtStart = JSON.stringify(INITIAL_DJ_DECK_STATE);
    expect(
      shouldApplyPersistResponse(hashAtStart, {
        ...INITIAL_DJ_DECK_STATE,
        masterVolume: 0.5,
      })
    ).toBe(false);
  });
});

describe("own persist echo suppression", () => {
  it("ignores host echo of own persist when deck matches", () => {
    expect(
      shouldIgnoreOwnPersistEcho(
        true,
        5,
        5,
        INITIAL_DJ_DECK_STATE,
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(true);
  });

  it("does not ignore when version differs", () => {
    expect(
      shouldIgnoreOwnPersistEcho(
        true,
        6,
        5,
        INITIAL_DJ_DECK_STATE,
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(false);
  });

  it("does not ignore for controllers", () => {
    expect(
      shouldIgnoreOwnPersistEcho(
        false,
        5,
        5,
        INITIAL_DJ_DECK_STATE,
        INITIAL_DJ_DECK_STATE
      )
    ).toBe(false);
  });
});
