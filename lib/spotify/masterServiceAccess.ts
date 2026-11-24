import { getValidAccessToken } from "@/lib/spotify/auth";

export class SpotifyMasterAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyMasterAccessError";
  }
}

/** Spotify token for master playlist / ISRC operations during Apple Music nights. */
export async function getSpotifyAccessTokenForMasters(): Promise<string> {
  try {
    const { accessToken } = await getValidAccessToken();
    return accessToken;
  } catch {
    throw new SpotifyMasterAccessError(
      "Spotify master sync is not configured. Connect Spotify on /spotify or save OAuth credentials for master playlists."
    );
  }
}

export async function tryGetSpotifyAccessTokenForMasters(): Promise<string | null> {
  try {
    return await getSpotifyAccessTokenForMasters();
  } catch {
    return null;
  }
}
