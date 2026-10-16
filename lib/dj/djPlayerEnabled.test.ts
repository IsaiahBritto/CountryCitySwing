import { describe, expect, it } from "vitest";
import { computeDjPlayerEnabled } from "@/lib/dj/djPlayerEnabled";

describe("computeDjPlayerEnabled", () => {
  const base = {
    hasAuthToken: true,
    isControllerMode: false,
    pendingTakeover: false,
    appleDeck: false,
    loading: false,
    isAdmin: true,
    audioUnlocked: false,
  };

  it("requires auth token", () => {
    expect(computeDjPlayerEnabled({ ...base, hasAuthToken: false })).toBe(false);
  });

  it("enables Apple deck for admin after loading without audio unlock", () => {
    expect(
      computeDjPlayerEnabled({
        ...base,
        appleDeck: true,
        audioUnlocked: false,
      })
    ).toBe(true);
  });

  it("disables Apple deck while page loading", () => {
    expect(
      computeDjPlayerEnabled({
        ...base,
        appleDeck: true,
        loading: true,
      })
    ).toBe(false);
  });

  it("requires audio unlock on Spotify deck", () => {
    expect(computeDjPlayerEnabled({ ...base, audioUnlocked: false })).toBe(false);
    expect(computeDjPlayerEnabled({ ...base, audioUnlocked: true })).toBe(true);
  });

  it("enables controller or pending takeover regardless of provider", () => {
    expect(
      computeDjPlayerEnabled({ ...base, isControllerMode: true, audioUnlocked: false })
    ).toBe(true);
    expect(
      computeDjPlayerEnabled({ ...base, pendingTakeover: true, audioUnlocked: false })
    ).toBe(true);
  });
});
