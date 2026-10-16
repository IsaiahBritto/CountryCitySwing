import { describe, expect, it } from "vitest";
import {
  musicAdminPath,
  musicDeckPath,
  providerToUrlSegment,
  urlSegmentToProvider,
} from "@/lib/music/providerSegments";

describe("providerSegments", () => {
  it("maps provider to URL segments", () => {
    expect(providerToUrlSegment("spotify")).toBe("spotify");
    expect(providerToUrlSegment("apple_music")).toBe("apple-music");
    expect(urlSegmentToProvider("apple-music")).toBe("apple_music");
  });

  it("builds admin and deck paths", () => {
    expect(musicAdminPath("spotify")).toBe("/admin/music/spotify");
    expect(musicDeckPath("apple_music")).toBe("/music/deck/apple-music");
  });
});
