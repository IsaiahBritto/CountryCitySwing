import { describe, expect, it } from "vitest";
import { toVideoEmbedUrl } from "./videoEmbedUrl";

describe("toVideoEmbedUrl", () => {
  it("converts youtube watch URLs", () => {
    expect(toVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts youtu.be URLs", () => {
    expect(toVideoEmbedUrl("https://youtu.be/abc123XYZ")).toBe(
      "https://www.youtube.com/embed/abc123XYZ"
    );
  });

  it("converts vimeo URLs", () => {
    expect(toVideoEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });

  it("returns null for invalid URLs", () => {
    expect(toVideoEmbedUrl("not-a-url")).toBeNull();
  });
});
