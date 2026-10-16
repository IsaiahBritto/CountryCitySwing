import type { TrackEndTickResult } from "@/lib/spotify/deckTrackEndTick";

export type TrackEndAction = "handoff" | "advance" | "none";

export function trackEndActionFromTick(
  result: Pick<TrackEndTickResult, "fireHandoff" | "fireAdvance">
): TrackEndAction {
  if (result.fireHandoff) return "handoff";
  if (result.fireAdvance) return "advance";
  return "none";
}

/** MusicKit completed/ended — treat as natural end (not near-end crossfade). */
export function trackEndActionFromPlaybackCompleted(input: {
  secondDeckEnabled: boolean;
  handoffToOtherDeckAfterSong: boolean;
}): TrackEndAction {
  const handoffEnabled =
    input.secondDeckEnabled && input.handoffToOtherDeckAfterSong;
  if (handoffEnabled) return "handoff";
  return "advance";
}
