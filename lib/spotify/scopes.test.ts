import { describe, expect, it } from "vitest";
import {
  missingScopes,
  needsDeckReconnect,
  parseGrantedScopes,
} from "@/lib/spotify/scopes";

describe("parseGrantedScopes", () => {
  it("parses space-delimited scopes", () => {
    expect(parseGrantedScopes("streaming user-read-private")).toEqual(
      new Set(["streaming", "user-read-private"])
    );
  });

  it("returns empty set for null", () => {
    expect(parseGrantedScopes(null).size).toBe(0);
  });
});

describe("needsDeckReconnect", () => {
  it("returns true when streaming scope missing", () => {
    expect(needsDeckReconnect("user-read-playback-state")).toBe(true);
  });

  it("returns false when all deck scopes present", () => {
    expect(
      needsDeckReconnect(
        "streaming user-modify-playback-state user-read-currently-playing user-read-playback-state"
      )
    ).toBe(false);
  });

  it("lists missing scopes", () => {
    expect(missingScopes("streaming")).toContain("user-modify-playback-state");
  });
});
