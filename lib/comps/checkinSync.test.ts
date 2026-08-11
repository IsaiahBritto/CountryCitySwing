import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkinSync,
  enqueueCheckin,
  resetCheckinSyncForTests,
  shouldApplyReload,
  shouldApplySyncReload,
} from "@/lib/comps/checkinSync";

function mockFetchImpl(postOrder: string[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/checkin")) {
      const body = JSON.parse(init?.body as string) as {
        round_entry_id?: string;
      };
      if (body.round_entry_id) {
        postOrder.push(body.round_entry_id);
      }
      return { ok: true, json: async () => ({ roundEntry: {} }) };
    }
    if (url.includes("/heats/refresh")) {
      return { ok: true, json: async () => ({ refreshed: true }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

async function flushAsync() {
  await flushAsyncMicrotasks();
  await vi.runAllTimersAsync();
  await flushAsyncMicrotasks();
}

async function flushAsyncMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("checkinSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCheckinSyncForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCheckinSyncForTests();
  });

  it("POSTs for same round run in enqueue order", async () => {
    const postOrder: string[] = [];
    const mockFetch = mockFetchImpl(postOrder);
    const reloadRound = vi.fn().mockResolvedValue(undefined);
    const roundId = "round-1";
    const base = {
      roundId,
      onOptimistic: () => checkinSync.bumpGeneration(roundId),
      onError: vi.fn(),
      reloadRound,
    };

    enqueueCheckin(
      { ...base, roundEntryId: "entry-a", checkin_status: "checked_in" },
      mockFetch
    );
    enqueueCheckin(
      { ...base, roundEntryId: "entry-b", checkin_status: "absent" },
      mockFetch
    );

    await flushAsync();

    expect(postOrder).toEqual(["entry-a", "entry-b"]);
  });

  it("debounced sync runs once after burst", async () => {
    const postOrder: string[] = [];
    const mockFetch = mockFetchImpl(postOrder);
    const reloadRound = vi.fn().mockResolvedValue(undefined);
    const roundId = "round-1";
    const base = {
      roundId,
      onOptimistic: () => checkinSync.bumpGeneration(roundId),
      onError: vi.fn(),
      reloadRound,
    };

    enqueueCheckin(
      { ...base, roundEntryId: "e0", checkin_status: "checked_in" },
      mockFetch
    );
    enqueueCheckin(
      { ...base, roundEntryId: "e1", checkin_status: "checked_in" },
      mockFetch
    );
    enqueueCheckin(
      { ...base, roundEntryId: "e2", checkin_status: "absent" },
      mockFetch
    );

    await vi.advanceTimersByTimeAsync(300);
    await flushAsyncMicrotasks();

    const refreshCalls = mockFetch.mock.calls.filter((call) =>
      String(call[0]).includes("/heats/refresh")
    );
    expect(refreshCalls).toHaveLength(1);
    expect(reloadRound).toHaveBeenCalledTimes(1);
    expect(reloadRound).toHaveBeenCalledWith(
      expect.objectContaining({ roundId, generationAtSyncStart: 3 })
    );
    expect(checkinSync.getGeneration(roundId)).toBe(3);
    expect(checkinSync.getSyncedGeneration(roundId)).toBe(3);
  });

  it("isSyncActive while sync reload is in flight", async () => {
    const postOrder: string[] = [];
    const mockFetch = mockFetchImpl(postOrder);
    const roundId = "round-1";
    let resolveReload: (() => void) | undefined;
    const reloadRound = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReload = resolve;
        })
    );

    enqueueCheckin(
      {
        roundId,
        roundEntryId: "entry-a",
        checkin_status: "checked_in",
        onOptimistic: () => checkinSync.bumpGeneration(roundId),
        onError: vi.fn(),
        reloadRound,
      },
      mockFetch
    );

    await vi.advanceTimersByTimeAsync(300);
    await flushAsyncMicrotasks();

    expect(checkinSync.isSyncActive(roundId)).toBe(true);

    resolveReload?.();
    await flushAsyncMicrotasks();

    expect(checkinSync.isSyncActive(roundId)).toBe(false);
    expect(checkinSync.getGeneration(roundId)).toBe(1);
    expect(checkinSync.getSyncedGeneration(roundId)).toBe(1);
  });

  it("waits for POSTs chained during queue drain before reload", async () => {
    const postOrder: string[] = [];
    let refreshStarted: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/checkin")) {
        const body = JSON.parse(init?.body as string) as {
          round_entry_id?: string;
        };
        if (body.round_entry_id) {
          postOrder.push(body.round_entry_id);
        }
        return { ok: true, json: async () => ({ roundEntry: {} }) };
      }
      if (url.includes("/heats/refresh")) {
        await refreshGate;
        return { ok: true, json: async () => ({ refreshed: true }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const reloadRound = vi.fn().mockResolvedValue(undefined);
    const roundId = "round-1";
    const base = {
      roundId,
      onOptimistic: () => checkinSync.bumpGeneration(roundId),
      onError: vi.fn(),
      reloadRound,
    };

    enqueueCheckin(
      { ...base, roundEntryId: "early-a", checkin_status: "checked_in" },
      mockFetch
    );
    enqueueCheckin(
      { ...base, roundEntryId: "early-b", checkin_status: "checked_in" },
      mockFetch
    );

    await vi.advanceTimersByTimeAsync(300);
    await flushAsyncMicrotasks();
    refreshStarted?.();

    enqueueCheckin(
      { ...base, roundEntryId: "late-c", checkin_status: "checked_in" },
      mockFetch
    );
    enqueueCheckin(
      { ...base, roundEntryId: "late-d", checkin_status: "checked_in" },
      mockFetch
    );

    await flushAsync();

    expect(postOrder).toEqual(["early-a", "early-b", "late-c", "late-d"]);
    expect(reloadRound).toHaveBeenCalledWith(
      expect.objectContaining({ roundId, generationAtSyncStart: 4 })
    );
  });

  it("shouldApplySyncReload is false while saves are pending", async () => {
    const roundId = "round-1";
    let resolvePost: (() => void) | undefined;
    const postGate = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes("/checkin")) {
        await postGate;
        return { ok: true, json: async () => ({ roundEntry: {} }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    enqueueCheckin(
      {
        roundId,
        roundEntryId: "entry-a",
        checkin_status: "checked_in",
        onOptimistic: () => checkinSync.bumpGeneration(roundId),
        onError: vi.fn(),
        reloadRound: vi.fn(),
      },
      mockFetch
    );

    expect(shouldApplySyncReload(roundId, 1)).toBe(false);

    resolvePost?.();
    await flushAsyncMicrotasks();

    expect(shouldApplySyncReload(roundId, 1)).toBe(true);
  });

  it("discards stale reload when generation bumped mid-sync", async () => {
    const postOrder: string[] = [];
    const mockFetch = mockFetchImpl(postOrder);
    const roundId = "round-1";
    const reloadRound = vi.fn(async (opts) => {
      if (opts?.generationAtSyncStart === 1) {
        checkinSync.bumpGeneration(roundId);
      }
    });
    const onSyncComplete = vi.fn();

    enqueueCheckin(
      {
        roundId,
        roundEntryId: "entry-a",
        checkin_status: "checked_in",
        onOptimistic: () => checkinSync.bumpGeneration(roundId),
        onError: vi.fn(),
        reloadRound,
        onSyncComplete,
      },
      mockFetch
    );

    await vi.advanceTimersByTimeAsync(300);
    await flushAsyncMicrotasks();

    expect(reloadRound).toHaveBeenCalledTimes(1);
    expect(onSyncComplete).not.toHaveBeenCalled();
    expect(shouldApplyReload(roundId, 1)).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    await flushAsyncMicrotasks();

    expect(reloadRound).toHaveBeenCalledTimes(2);
    expect(onSyncComplete).toHaveBeenCalledTimes(1);
    expect(checkinSync.getGeneration(roundId)).toBe(2);
    expect(checkinSync.getSyncedGeneration(roundId)).toBe(2);
  });
});
