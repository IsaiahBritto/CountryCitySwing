"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch } from "@/lib/comps/clientAuth";
import {
  FLUSH_DEBOUNCE_MS,
  followUpFlushDelayMs,
  mergeScorePatch,
  pruneAckedPending,
  type ScorePatch,
} from "@/lib/comps/autosaveHelpers";

export type { ScorePatch } from "@/lib/comps/autosaveHelpers";

export type SaveState = "idle" | "saving" | "offline";

const PERSIST_DEBOUNCE_MS = 500;

/**
 * Silent autosave for judge sheets: every change is queued, debounced to the
 * server, mirrored to localStorage for flaky venue Wi-Fi, and retried until
 * it lands. Also broadcasts progress so the director console updates live.
 */
export function useAutosaveQueue(opts: {
  roundId: string;
  judgeAssignmentId: string;
  /** Included in the payload when an admin scores on the judge's behalf. */
  sendAssignmentId: boolean;
}) {
  const { roundId, judgeAssignmentId, sendAssignmentId } = opts;
  const storageKey = `ccs-judge-draft-${roundId}-${judgeAssignmentId}`;
  const pending = useRef<Map<string, ScorePatch>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const lastFailed = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(
    null
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabaseBrowser.channel(`comp-round-${roundId}`);
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      supabaseBrowser.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roundId]);

  const updateSaveState = useCallback((next: SaveState) => {
    startTransition(() => setSaveState(next));
  }, []);

  const persistNow = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify([...pending.current.values()])
      );
    } catch {
      // Storage full/unavailable; the in-memory queue still retries.
    }
  }, [storageKey]);

  const persist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
  }, [persistNow]);

  const broadcastProgress = useCallback(
    (scored: number, total: number) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "judge_progress",
        payload: { judgeAssignmentId, scored, total },
      });
    },
    [judgeAssignmentId]
  );

  const scheduleFlush = useCallback((delayMs: number) => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      void flushRef.current();
    }, delayMs);
  }, []);

  const flushRef = useRef<() => Promise<void>>(async () => {});

  flushRef.current = async () => {
    if (inFlight.current || pending.current.size === 0) return;
    inFlight.current = true;
    if (pending.current.size > 0) updateSaveState("saving");
    const snapshot = [...pending.current.entries()];
    try {
      const res = await authedFetch(`/api/judge/rounds/${roundId}/scores`, {
        method: "PUT",
        body: JSON.stringify({
          scores: snapshot.map(([, patch]) => patch),
          ...(sendAssignmentId ? { judge_assignment_id: judgeAssignmentId } : {}),
        }),
      });
      if (res.ok) {
        lastFailed.current = false;
        pruneAckedPending(pending.current, snapshot);
        persistNow();
        updateSaveState(pending.current.size > 0 ? "saving" : "idle");
      } else if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setLockedMessage(body?.error ?? "Scoring is locked for this round");
        pending.current.clear();
        persistNow();
        updateSaveState("idle");
      } else {
        lastFailed.current = true;
        updateSaveState("offline");
      }
    } catch {
      lastFailed.current = true;
      updateSaveState("offline");
    } finally {
      inFlight.current = false;
      if (pending.current.size > 0) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        const delay = followUpFlushDelayMs(lastFailed.current);
        retryTimer.current = setTimeout(() => {
          void flushRef.current();
        }, delay);
      }
    }
  };

  const flush = useCallback(async () => {
    await flushRef.current();
  }, []);

  const queue = useCallback(
    (patches: ScorePatch[], progress?: { scored: number; total: number }) => {
      for (const patch of patches) {
        const existing = pending.current.get(patch.round_entry_id);
        pending.current.set(
          patch.round_entry_id,
          mergeScorePatch(existing, patch)
        );
      }
      persist();
      scheduleFlush(FLUSH_DEBOUNCE_MS);
      if (progress) broadcastProgress(progress.scored, progress.total);
    },
    [persist, scheduleFlush, broadcastProgress]
  );

  const restoreUnsent = useCallback((): ScorePatch[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const patches = JSON.parse(raw) as ScorePatch[];
      if (Array.isArray(patches) && patches.length > 0) {
        for (const patch of patches) {
          pending.current.set(patch.round_entry_id, patch);
        }
        scheduleFlush(500);
        return patches;
      }
    } catch {
      // Corrupt draft; ignore.
    }
    return [];
  }, [storageKey, scheduleFlush]);

  const clearDraft = useCallback(() => {
    pending.current.clear();
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    []
  );

  return {
    queue,
    flushNow: flush,
    restoreUnsent,
    clearDraft,
    saveState,
    lockedMessage,
    broadcastProgress,
  };
}
