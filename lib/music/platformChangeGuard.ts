import { getActivePlaylistStatus } from "@/lib/spotify/activePlaylist";
import { getActiveSessionRow } from "@/lib/spotify/djSessionServer";

export type PlatformChangeBlock = {
  canChange: false;
  blockReason: string;
};

export type PlatformChangeAllow = {
  canChange: true;
  blockReason: null;
};

export type PlatformChangeStatus = PlatformChangeBlock | PlatformChangeAllow;

export async function getMusicPlatformChangeStatus(): Promise<PlatformChangeStatus> {
  const [activeSocial, activeSession] = await Promise.all([
    getActivePlaylistStatus(),
    getActiveSessionRow(),
  ]);

  if (activeSocial.isActive) {
    return {
      canChange: false,
      blockReason:
        "Deactivate the active social playlist before switching music provider.",
    };
  }

  if (activeSession) {
    return {
      canChange: false,
      blockReason: "End the active DJ session before switching music provider.",
    };
  }

  return { canChange: true, blockReason: null };
}
