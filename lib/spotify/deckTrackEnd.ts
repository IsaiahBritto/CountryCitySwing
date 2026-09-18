import { trackUrisMatch } from "@/lib/spotify/trackUri";

export function shouldSkipTrackEndAutomation(input: {
  sdkUri: string | null | undefined;
  activeDeckTrackUri: string | null | undefined;
  handoffInProgress: boolean;
}): boolean {
  if (input.handoffInProgress) return true;
  if (!input.sdkUri || !input.activeDeckTrackUri) return false;
  return !trackUrisMatch(input.sdkUri, input.activeDeckTrackUri);
}

/** Handoff runs only after playback has stopped at end (not crossfade near-end). */
export function shouldAttemptHandoffAtEnd(input: {
  handoffEnabled: boolean;
  endedNaturally: boolean;
}): boolean {
  return input.handoffEnabled && input.endedNaturally;
}

/** Same-deck auto-advance: near-end crossfade or natural end when handoff is off. */
export function shouldTriggerNormalTrackEnd(input: {
  handoffEnabled: boolean;
  nearEndWhilePlaying: boolean;
  endedNaturally: boolean;
}): boolean {
  if (input.handoffEnabled) return false;
  return input.nearEndWhilePlaying || input.endedNaturally;
}
