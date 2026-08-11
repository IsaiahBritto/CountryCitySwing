import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import type { CheckinStatus } from "@/lib/comps/types";

const DEBOUNCE_MS = 300;

export interface CheckinReloadOptions {
  force?: boolean;
  generationAtSyncStart?: number;
  roundId?: string;
}

export interface CheckinSyncCallbacks {
  onOptimistic: () => void;
  onError: (message: string) => void;
  reloadRound: (options?: CheckinReloadOptions) => Promise<void>;
  onSyncComplete?: () => void;
}

export interface CheckinEnqueueOptions extends CheckinSyncCallbacks {
  roundId: string;
  roundEntryId: string;
  checkin_status: CheckinStatus;
}

type FetchFn = typeof authedFetch;

interface RoundState {
  generation: number;
  syncedGeneration: number;
  queue: Promise<void>;
  pendingSaves: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  syncInFlight: boolean;
}

const rounds = new Map<string, RoundState>();

function getRoundState(roundId: string): RoundState {
  let state = rounds.get(roundId);
  if (!state) {
    state = {
      generation: 0,
      syncedGeneration: 0,
      queue: Promise.resolve(),
      pendingSaves: 0,
      debounceTimer: null,
      syncInFlight: false,
    };
    rounds.set(roundId, state);
  }
  return state;
}

function postCheckin(
  roundId: string,
  roundEntryId: string,
  checkin_status: CheckinStatus,
  fetchFn: FetchFn
) {
  return fetchFn(`/api/admin/comps/rounds/${roundId}/checkin`, {
    method: "POST",
    body: JSON.stringify({ round_entry_id: roundEntryId, checkin_status }),
  });
}

async function refreshHeats(roundId: string, fetchFn: FetchFn) {
  try {
    const res = await fetchFn(
      `/api/admin/comps/rounds/${roundId}/heats/refresh`,
      { method: "POST" }
    );
    if (!res.ok) {
      console.warn(
        `Heat refresh failed for round ${roundId}: ${await apiError(res)}`
      );
    }
  } catch {
    // Non-fatal; reload still picks up check-in state.
  }
}

async function drainSaveQueue(roundId: string) {
  const state = getRoundState(roundId);
  while (true) {
    const tail = state.queue;
    await tail;
    if (state.queue === tail) break;
  }
}

async function runRoundSync(
  roundId: string,
  callbacks: CheckinSyncCallbacks,
  fetchFn: FetchFn
) {
  const state = getRoundState(roundId);
  state.syncInFlight = true;
  try {
    await drainSaveQueue(roundId);
    await refreshHeats(roundId, fetchFn);
    await drainSaveQueue(roundId);

    const generationAtSyncStart = state.generation;
    await callbacks.reloadRound({ generationAtSyncStart, roundId });

    if (!shouldApplyReload(roundId, generationAtSyncStart)) {
      scheduleRoundSync(roundId, callbacks, fetchFn);
      return;
    }

    state.syncedGeneration = generationAtSyncStart;
    callbacks.onSyncComplete?.();
  } finally {
    state.syncInFlight = false;
  }
}

function scheduleRoundSync(
  roundId: string,
  callbacks: CheckinSyncCallbacks,
  fetchFn: FetchFn
) {
  const state = getRoundState(roundId);
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    void runRoundSync(roundId, callbacks, fetchFn);
  }, DEBOUNCE_MS);
}

export function bumpGeneration(roundId: string): number {
  const state = getRoundState(roundId);
  state.generation += 1;
  return state.generation;
}

export function getGeneration(roundId: string): number {
  return getRoundState(roundId).generation;
}

export function shouldApplyReload(
  roundId: string,
  generationAtSyncStart: number
): boolean {
  return getGeneration(roundId) === generationAtSyncStart;
}

export function shouldApplySyncReload(
  roundId: string,
  generationAtSyncStart: number
): boolean {
  const state = getRoundState(roundId);
  return (
    state.generation === generationAtSyncStart && state.pendingSaves === 0
  );
}

export function getSyncedGeneration(roundId: string): number {
  return getRoundState(roundId).syncedGeneration;
}

export function isBackgroundReloadAllowed(roundId: string): boolean {
  const state = getRoundState(roundId);
  return state.generation === state.syncedGeneration;
}

export function markSynced(roundId: string) {
  const state = getRoundState(roundId);
  state.syncedGeneration = state.generation;
}

export function hasPending(roundId: string): boolean {
  const state = getRoundState(roundId);
  return (
    state.pendingSaves > 0 ||
    state.debounceTimer != null ||
    state.syncInFlight
  );
}

export function isSyncActive(roundId: string): boolean {
  return hasPending(roundId);
}

export function hasAnyPendingOptimisticEdits(): boolean {
  for (const state of rounds.values()) {
    if (state.generation !== state.syncedGeneration) return true;
  }
  return false;
}

/** Debounced heat refresh + reload after roster changes (e.g. promote alternate). */
export function scheduleSyncAfterChange(
  roundId: string,
  callbacks: CheckinSyncCallbacks,
  fetchFn: FetchFn = authedFetch
) {
  scheduleRoundSync(roundId, callbacks, fetchFn);
}

export function enqueueCheckin(
  options: CheckinEnqueueOptions,
  fetchFn: FetchFn = authedFetch
) {
  const { roundId, roundEntryId, checkin_status, ...callbacks } = options;
  const state = getRoundState(roundId);

  callbacks.onOptimistic();
  state.pendingSaves += 1;

  state.queue = state.queue
    .then(async () => {
      const res = await postCheckin(
        roundId,
        roundEntryId,
        checkin_status,
        fetchFn
      );
      if (!res.ok) {
        callbacks.onError(await apiError(res));
        await callbacks.reloadRound({ force: true, roundId });
        const failedState = getRoundState(roundId);
        failedState.generation = failedState.syncedGeneration;
      }
    })
    .catch(() => {
      /* prior failure already handled */
    })
    .finally(() => {
      state.pendingSaves -= 1;
    });

  scheduleRoundSync(roundId, callbacks, fetchFn);
}

/** Test-only reset. */
export function resetCheckinSyncForTests() {
  for (const state of rounds.values()) {
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
  }
  rounds.clear();
}

export const checkinSync = {
  bumpGeneration,
  getGeneration,
  getSyncedGeneration,
  shouldApplyReload,
  shouldApplySyncReload,
  isBackgroundReloadAllowed,
  markSynced,
  hasPending,
  isSyncActive,
  hasAnyPendingOptimisticEdits,
  enqueue: enqueueCheckin,
  scheduleSyncAfterChange,
  resetCheckinSyncForTests,
};
