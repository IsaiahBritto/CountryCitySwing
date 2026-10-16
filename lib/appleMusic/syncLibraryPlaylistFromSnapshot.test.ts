import { describe, expect, it, vi, beforeEach } from "vitest";
import { syncLibraryPlaylistFromSnapshot } from "@/lib/appleMusic/syncLibraryPlaylistFromSnapshot";

const listIds = vi.fn();
const removeTracks = vi.fn();
const addTracks = vi.fn();

vi.mock("@/lib/appleMusic/client", () => ({
  listLibraryPlaylistTrackRelationshipIds: (...args: unknown[]) =>
    listIds(...args),
  removeTracksFromLibraryPlaylist: (...args: unknown[]) => removeTracks(...args),
  addTracksToLibraryPlaylist: (...args: unknown[]) => addTracks(...args),
}));

describe("syncLibraryPlaylistFromSnapshot", () => {
  beforeEach(() => {
    listIds.mockReset();
    removeTracks.mockReset();
    addTracks.mockReset();
    listIds.mockResolvedValue(["rel-a", "rel-b"]);
    removeTracks.mockResolvedValue(undefined);
    addTracks.mockResolvedValue(undefined);
  });

  it("rebuilds library playlist from ordered catalog ids", async () => {
    await syncLibraryPlaylistFromSnapshot({
      developerToken: "dev",
      musicUserToken: "user",
      playlistId: "pl-1",
      orderedCatalogSongIds: ["song-1", "song-2"],
    });

    expect(removeTracks).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: "pl-1",
        libraryTrackIds: ["rel-a", "rel-b"],
      })
    );
    expect(addTracks).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: "pl-1",
        songIds: ["song-1", "song-2"],
      })
    );
  });
});
