import { describe, expect, it } from "vitest";
import {
  activeCatalogPlaylistId,
  type ActiveCatalogPlaylistStatus,
} from "@/lib/spotify/activeCatalogPlaylist";

function baseStatus(
  overrides: Partial<
    ActiveCatalogPlaylistStatus & {
      isActive: boolean;
      activatedAt: string | null;
      activationId: string | null;
    }
  >
) {
  return {
    isActive: true,
    spotifyPlaylistId: null,
    appleMusicPlaylistId: null,
    activatedAt: "2026-01-01T00:00:00.000Z",
    activationId: "act-1",
    ...overrides,
  };
}

describe("activeCatalogPlaylistId", () => {
  it("prefers Apple Music playlist id when set", () => {
    const status = baseStatus({
      appleMusicPlaylistId: "p.apple",
      spotifyPlaylistId: "p.spotify",
    });
    expect(activeCatalogPlaylistId(status)).toBe("p.apple");
  });

  it("falls back to Spotify playlist id", () => {
    const status = baseStatus({
      spotifyPlaylistId: "p.spotify",
    });
    expect(activeCatalogPlaylistId(status)).toBe("p.spotify");
  });

  it("returns null when neither id is set", () => {
    const status = baseStatus({});
    expect(activeCatalogPlaylistId(status)).toBeNull();
  });
});

describe("Apple-only active gate", () => {
  it("allows requests when only appleMusicPlaylistId is present", () => {
    const status = baseStatus({
      spotifyPlaylistId: null,
      appleMusicPlaylistId: "library-playlist-1",
    });
    const catalogId = activeCatalogPlaylistId(status);
    const gateOpen =
      status.isActive &&
      Boolean(catalogId) &&
      Boolean(status.activatedAt) &&
      Boolean(status.activationId);
    expect(gateOpen).toBe(true);
  });
});
