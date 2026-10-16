import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appleMusic/apiFetch", () => ({
  appleMusicApiFetch: vi.fn(),
}));

import { appleMusicApiFetch } from "@/lib/appleMusic/apiFetch";
import {
  listLibraryPlaylists,
  resolveAppleMusicNextPath,
} from "@/lib/appleMusic/client";

describe("resolveAppleMusicNextPath", () => {
  it("passes through relative next links", () => {
    expect(resolveAppleMusicNextPath("/v1/me/library/playlists?offset=100")).toBe(
      "/v1/me/library/playlists?offset=100"
    );
  });

  it("strips origin from absolute next links", () => {
    expect(
      resolveAppleMusicNextPath(
        "https://api.music.apple.com/v1/me/library/playlists?offset=100"
      )
    ).toBe("/v1/me/library/playlists?offset=100");
  });
});

describe("listLibraryPlaylists", () => {
  beforeEach(() => {
    vi.mocked(appleMusicApiFetch).mockReset();
  });

  it("follows relative next links and merges all pages", async () => {
    vi.mocked(appleMusicApiFetch)
      .mockResolvedValueOnce({
        data: [{ id: "p.one", attributes: { name: "One", trackCount: 1 } }],
        next: "/v1/me/library/playlists?offset=100",
      })
      .mockResolvedValueOnce({
        data: [{ id: "p.two", attributes: { name: "Two", trackCount: 2 } }],
      });

    const playlists = await listLibraryPlaylists({
      developerToken: "dev",
      musicUserToken: "user",
    });

    expect(appleMusicApiFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(appleMusicApiFetch).mock.calls[1]?.[0]).toBe(
      "/v1/me/library/playlists?offset=100"
    );
    expect(playlists).toEqual([
      { id: "p.one", name: "One", trackCount: 1 },
      { id: "p.two", name: "Two", trackCount: 2 },
    ]);
  });
});
