import { describe, expect, it } from "vitest";
import { parseDjSessionCommand } from "@/lib/spotify/djSessionCommands";

describe("parseDjSessionCommand", () => {
  it("accepts valid commands", () => {
    expect(parseDjSessionCommand({ type: "PAUSE" })).toEqual({ type: "PAUSE" });
    expect(parseDjSessionCommand({ type: "PLAY_DECK", deck: "A" })).toEqual({
      type: "PLAY_DECK",
      deck: "A",
    });
    expect(
      parseDjSessionCommand({
        type: "ADVANCE_TRACK",
        deck: "B",
        autoPlay: true,
      })
    ).toEqual({ type: "ADVANCE_TRACK", deck: "B", autoPlay: true });
    expect(
      parseDjSessionCommand({ type: "SEEK", positionMs: 5000 })
    ).toEqual({ type: "SEEK", positionMs: 5000 });
  });

  it("rejects invalid commands", () => {
    expect(parseDjSessionCommand(null)).toBeNull();
    expect(parseDjSessionCommand({ type: "UNKNOWN" })).toBeNull();
    expect(parseDjSessionCommand({ type: "PLAY_DECK", deck: "C" })).toBeNull();
    expect(parseDjSessionCommand({ type: "SEEK", positionMs: -1 })).toBeNull();
  });
});
