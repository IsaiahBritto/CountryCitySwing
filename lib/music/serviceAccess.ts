import { getCachedAppleDeveloperToken } from "@/lib/appleMusic/developerToken";
import { getStoredAppleMusicUserToken } from "@/lib/appleMusic/sessionCredentials";
import { isServerAppleMusic } from "@/lib/music/serverProvider";

export type AppleServiceAccess = {
  provider: "apple_music";
  developerToken: string;
  musicUserToken: string;
  storefrontId: string;
};

export type SpotifyServiceAccess = {
  provider: "spotify";
  accessToken: string;
};

export type MusicServiceAccess = AppleServiceAccess | SpotifyServiceAccess;

export async function getMusicServiceAccess(): Promise<MusicServiceAccess> {
  if (await isServerAppleMusic()) {
    const creds = await getStoredAppleMusicUserToken();
    if (!creds?.musicUserToken) {
      throw new Error(
        "Apple Music is not connected. Open the DJ deck, authorize Apple Music, and try again."
      );
    }
    const { token } = getCachedAppleDeveloperToken();
    return {
      provider: "apple_music",
      developerToken: token,
      musicUserToken: creds.musicUserToken,
      storefrontId: creds.storefrontId ?? "us",
    };
  }

  const { getValidAccessToken } = await import("@/lib/spotify/auth");
  const { accessToken } = await getValidAccessToken();
  return { provider: "spotify", accessToken };
}

export function accessTokenFromService(
  access: MusicServiceAccess
): string {
  if (access.provider === "spotify") return access.accessToken;
  return access.developerToken;
}
