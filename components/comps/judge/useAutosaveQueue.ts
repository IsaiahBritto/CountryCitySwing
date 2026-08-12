"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch } from "@/lib/comps/clientAuth";

export interface ScorePatch {
  round_entry_id: string;
  callback_value?: string | null;
  ordinal?: number | null;
  raw_score?: number | null;
  thumbs_up_count?: number;
  thumbs_down_count?: number;
}

export type SaveState = "idle" | "saving" | "offline";

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
  const inFlight = useRef(false);
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

  const persist = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify([...pending.current.values()])
      );
    } catch {
      // Storage full/unavailable; the in-memory queue still retries.
    }
  }, [storageKey]);

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

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current.size === 0) return;
    inFlight.current = true;
    setSaveState("saving");
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
        // Drop only entries that did not change while the request was out.
        for (const [key, patch] of snapshot) {
          if (pending.current.get(key) === patch) pending.current.delete(key);
        }
        persist();
        setSaveState(pending.current.size > 0 ? "saving" : "idle");
      } else if (res.status === 409) {
        // Sheet locked or round closed: stop retrying, surface the reason.
        const body = await res.json().catch(() => ({}));
        setLockedMessage(body?.error ?? "Scoring is locked for this round");
        pending.current.clear();
        persist();
        setSaveState("idle");
      } else {
        setSaveState("offline");
      }
    } catch {
      setSaveState("offline");
    } finally {
      inFlight.current = false;
      if (pending.current.size > 0) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(flush, 4000);
      }
    }
  }, [roundId, judgeAssignmentId, sendAssignmentId, persist]);

  const queue = useCallback(
    (patches: ScorePatch[], progress?: { scored: number; total: number }) => {
      for (const patch of patches) {
        const existing = pending.current.get(patch.round_entry_id);
        pending.current.set(patch.round_entry_id, { ...existing, ...patch });
      }
      persist();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flush, 700);
      if (progress) broadcastProgress(progress.scored, progress.total);
    },
    [flush, persist, broadcastProgress]
  );

  /** Unsent changes from a previous session (crash/refresh recovery). */
  const restoreUnsent = useCallback((): ScorePatch[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const patches = JSON.parse(raw) as ScorePatch[];
      if (Array.isArray(patches) && patches.length > 0) {
        for (const patch of patches) {
          pending.current.set(patch.round_entry_id, patch);
        }
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 500);
        return patches;
      }
    } catch {
      // Corrupt draft; ignore.
    }
    return [];
  }, [storageKey, flush]);

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
