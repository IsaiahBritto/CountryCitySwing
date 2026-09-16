import type { DeckTrack } from "@/lib/spotify/djDeckState";
import type { DeckPlaylistPatch } from "@/lib/spotify/deckPlaylistSync";
import type { SocialRequestInput } from "@/lib/spotify/socialRequest";

export type DeckTrackFields = Pick<
  DeckTrack,
  "id" | "uri" | "name" | "primaryArtist" | "durationMs"
>;

export function inputToDeckTrack(
  input: Pick<
    SocialRequestInput,
    "trackId" | "uri" | "name" | "primaryArtist" | "durationMs"
  >
): DeckTrack {
  return {
    id: input.trackId,
    uri: input.uri,
    name: input.name,
    primaryArtist: input.primaryArtist,
    durationMs: input.durationMs ?? 0,
  };
}

export function buildDeckPlaylistPatch(input: {
  result: "replaced" | "appended" | "swapped";
  position: number;
  swapFrom?: number;
  track?: DeckTrackFields;
  purgePositions?: number[];
}): DeckPlaylistPatch | null {
  const patches: DeckPlaylistPatch[] = [];

  if (input.purgePositions?.length) {
    const sorted = [...input.purgePositions].sort((a, b) => b - a);
    for (const position of sorted) {
      patches.push({ op: "remove", position });
    }
  }

  switch (input.result) {
    case "swapped": {
      if (input.swapFrom == null) return null;
      patches.push({
        op: "swap",
        from: input.swapFrom,
        to: input.position,
      });
      break;
    }
    case "replaced": {
      if (!input.track) return null;
      patches.push({
        op: "replace",
        position: input.position,
        track: input.track,
      });
      break;
    }
    case "appended": {
      if (!input.track) return null;
      patches.push({ op: "append", track: input.track });
      break;
    }
    default:
      return null;
  }

  if (patches.length === 0) return null;
  if (patches.length === 1) return patches[0]!;
  return { op: "batch", patches };
}
