import type { CallbackJudgingMethod } from "@/lib/comps/types";
import type { CallbackVote } from "@/lib/scoring/callbackRawSync";

/** True when every competitor has been scored in the judge's primary input method. */
export function callbackPrimaryComplete(
  method: CallbackJudgingMethod,
  entryIds: string[],
  votes: Map<string, CallbackVote>,
  rawById: Map<string, number | null>
): boolean {
  if (entryIds.length === 0) return false;
  if (method === "placement") {
    return entryIds.every((id) => votes.has(id));
  }
  return entryIds.every((id) => rawById.get(id) != null);
}

export function judgingMethodStorageKey(
  roundId: string,
  judgeAssignmentId: string
): string {
  return `ccs-judge-method-${roundId}-${judgeAssignmentId}`;
}
