import { describe, expect, it } from "vitest";
import { shouldRestartFromBeginning } from "@/lib/spotify/playbackStart";

describe("shouldRestartFromBeginning", () => {
  it("returns false when caller wants a non-zero start position", () => {
    expect(shouldRestartFromBeginning(5000, 179000, 180000)).toBe(false);
  });

  it("returns true when SDK position is materially ahead of requested start", () => {
    expect(shouldRestartFromBeginning(0, 5000, 180000)).toBe(true);
    expect(shouldRestartFromBeginning(0, 1001, 180000)).toBe(true);
  });

  it("returns false when SDK position is at or near the start", () => {
    expect(shouldRestartFromBeginning(0, 0, 180000)).toBe(false);
    expect(shouldRestartFromBeginning(0, 500, 180000)).toBe(false);
    expect(shouldRestartFromBeginning(0, 1000, 180000)).toBe(false);
  });

  it("returns true when SDK position is near track end", () => {
    expect(shouldRestartFromBeginning(0, 179600, 180000)).toBe(true);
  });
});
