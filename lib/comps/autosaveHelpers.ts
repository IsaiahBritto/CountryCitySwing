export interface ScorePatch {
  round_entry_id: string;
  callback_value?: string | null;
  ordinal?: number | null;
  raw_score?: number | null;
  thumbs_up_count?: number;
  thumbs_down_count?: number;
  /** Client draft only — stripped before API PUT. */
  placement_automated?: boolean;
}

export const FLUSH_DEBOUNCE_MS = 700;
export const CHAIN_DEBOUNCE_MS = 200;
export const RETRY_DELAY_MS = 4000;

/** Omit client-only draft fields before sending to the API. */
export function scorePatchForApi(patch: ScorePatch): ScorePatch {
  const { placement_automated: _automated, ...apiPatch } = patch;
  return apiPatch;
}

export function mergeScorePatch(
  existing: ScorePatch | undefined,
  patch: ScorePatch
): ScorePatch {
  return { ...existing, ...patch };
}

export function followUpFlushDelayMs(lastFailed: boolean): number {
  return lastFailed ? RETRY_DELAY_MS : CHAIN_DEBOUNCE_MS;
}

/** Drop acked entries only when the pending value matches the sent snapshot. */
export function pruneAckedPending(
  pending: Map<string, ScorePatch>,
  snapshot: [string, ScorePatch][]
): void {
  for (const [key, patch] of snapshot) {
    if (pending.get(key) === patch) pending.delete(key);
  }
}
