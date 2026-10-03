import { describe, expect, it } from "vitest";
import {
  isPointerNearRangeThumb,
  RANGE_THUMB_HIT_PX,
} from "@/lib/comps/rangeSliderThumb";

const TRACK = 300;

describe("isPointerNearRangeThumb", () => {
  it("returns true when pointer is at thumb center", () => {
    expect(isPointerNearRangeThumb(50, 0, 100, TRACK, 150)).toBe(true);
  });

  it("returns false when pointer is far from thumb on track", () => {
    expect(isPointerNearRangeThumb(50, 0, 100, TRACK, 20)).toBe(false);
    expect(isPointerNearRangeThumb(50, 0, 100, TRACK, 280)).toBe(false);
  });

  it("detects thumb at track start (value 0)", () => {
    expect(isPointerNearRangeThumb(0, 0, 100, TRACK, 0)).toBe(true);
    expect(isPointerNearRangeThumb(0, 0, 100, TRACK, 30)).toBe(false);
  });

  it("detects thumb at track end (value 100)", () => {
    expect(isPointerNearRangeThumb(100, 0, 100, TRACK, TRACK)).toBe(true);
    expect(isPointerNearRangeThumb(100, 0, 100, TRACK, TRACK - 30)).toBe(
      false
    );
  });

  it("respects custom hit radius", () => {
    expect(
      isPointerNearRangeThumb(50, 0, 100, TRACK, 150 + 20, 20)
    ).toBe(true);
    expect(
      isPointerNearRangeThumb(50, 0, 100, TRACK, 150 + 21, 20)
    ).toBe(false);
  });

  it("uses default hit radius constant", () => {
    expect(RANGE_THUMB_HIT_PX).toBe(24);
    expect(isPointerNearRangeThumb(50, 0, 100, TRACK, 150 + 24)).toBe(true);
    expect(isPointerNearRangeThumb(50, 0, 100, TRACK, 150 + 25)).toBe(false);
  });

  it("returns false for invalid track or range", () => {
    expect(isPointerNearRangeThumb(50, 0, 100, 0, 0)).toBe(false);
    expect(isPointerNearRangeThumb(50, 100, 100, TRACK, 0)).toBe(false);
  });
});
