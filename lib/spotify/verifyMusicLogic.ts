import type { SpotifyTrack } from "@/lib/spotify/client";

export type VerifyDance = "country_swing" | "two_step" | "waltz";

export type VerifyMusicSaveItem = {
  trackId: string;
  uri: string;
  dance: VerifyDance;
};

export function isVerifyDance(value: unknown): value is VerifyDance {
  return (
    value === "country_swing" ||
    value === "two_step" ||
    value === "waltz"
  );
}

export function partitionVerifySaveItems(items: VerifyMusicSaveItem[]): {
  twoStep: VerifyMusicSaveItem[];
  waltz: VerifyMusicSaveItem[];
  reclassifiedTrackIds: Set<string>;
} {
  const twoStep: VerifyMusicSaveItem[] = [];
  const waltz: VerifyMusicSaveItem[] = [];
  const reclassifiedTrackIds = new Set<string>();

  for (const item of items) {
    if (item.dance === "two_step") {
      twoStep.push(item);
      reclassifiedTrackIds.add(item.trackId);
    } else if (item.dance === "waltz") {
      waltz.push(item);
      reclassifiedTrackIds.add(item.trackId);
    }
  }

  return { twoStep, waltz, reclassifiedTrackIds };
}

/** Unique URIs not already present in destination playlist. */
export function urisToAdd(
  candidates: string[],
  existingUris: Set<string>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uri of candidates) {
    if (existingUris.has(uri) || seen.has(uri)) continue;
    seen.add(uri);
    out.push(uri);
  }
  return out;
}

export function collectRemovalEntries(
  playlistItems: Array<{ track: SpotifyTrack; position: number }>,
  trackIdsToRemove: Set<string>
): Array<{ uri: string; position: number }> {
  return playlistItems
    .filter((item) => trackIdsToRemove.has(item.track.id))
    .map((item) => ({ uri: item.track.uri, position: item.position }));
}
