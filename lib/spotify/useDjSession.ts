"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from "react";
import { randomId } from "@/lib/randomId";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetchWithRetry } from "@/lib/clientAuth";
import {
  DJ_CLIENT_ID_STORAGE_KEY,
  HEARTBEAT_INTERVAL_MS,
  STATE_PATCH_DEBOUNCE_MS,
  type DjHostStatus,
  type DjPlaybackSnapshot,
  type DjSessionResponse,
  type DjSessionRole,
  toSessionResponse,
} from "@/lib/spotify/djSession";
import {
  serializeDjDeckState,
  type DjDeckAction,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";
import {
  deckStateContentHash,
  mergeSessionMetadata,
  shouldApplyPersistResponse,
  shouldFullRestoreOnJoin,
  shouldIgnoreOwnPersistEcho,
  shouldSkipDeckRestore,
} from "@/lib/spotify/djSessionSync";
import type { DjSessionRow } from "@/lib/spotify/djSession";

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(DJ_CLIENT_ID_STORAGE_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(DJ_CLIENT_ID_STORAGE_KEY, id);
  }
  return id;
}

function rowToResponse(row: DjSessionRow): DjSessionResponse {
  return toSessionResponse(row);
}

function clearSessionRefs(refs: {
  lastAppliedVersionRef: { current: number };
  lastPersistedDeckHashRef: { current: string | null };
  lastOwnPersistVersionRef: { current: number };
}) {
  refs.lastAppliedVersionRef.current = 0;
  refs.lastPersistedDeckHashRef.current = null;
  refs.lastOwnPersistVersionRef.current = 0;
}

export type UseDjSessionOptions = {
  authToken: string | null;
  enabled: boolean;
  deckState: DjDeckState;
  dispatch: Dispatch<DjDeckAction>;
  onSessionRestored?: () => void;
  onError?: (message: string) => void;
  getPlaybackSnapshot: () => DjPlaybackSnapshot;
  hostDeviceIdRef?: RefObject<string | null>;
  shouldApplyDeckState?: (
    incoming: DjSessionResponse,
    current: DjSessionResponse | null
  ) => boolean;
  onHostSessionLoaded?: (session: DjSessionResponse) => void;
};

export type UseDjSessionReturn = {
  clientId: string;
  role: DjSessionRole;
  session: DjSessionResponse | null;
  hostStatus: DjHostStatus;
  loading: boolean;
  canExecutePlayback: boolean;
  isRemoteController: boolean;
  startSession: () => Promise<boolean>;
  endSession: () => Promise<boolean>;
  takeoverSession: (hostDeviceId: string) => Promise<boolean>;
  persistNow: () => Promise<void>;
  flushPersist: () => Promise<void>;
  applyRemoteSession: (session: DjSessionResponse) => void;
};

export function useDjSession(options: UseDjSessionOptions): UseDjSessionReturn {
  const {
    authToken,
    enabled,
    deckState,
    dispatch,
    onSessionRestored,
    onError,
    getPlaybackSnapshot,
    hostDeviceIdRef,
    shouldApplyDeckState,
    onHostSessionLoaded,
  } = options;

  const clientIdRef = useRef(getOrCreateClientId());
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const deckStateRef = useRef(deckState);
  deckStateRef.current = deckState;

  const sessionRef = useRef<DjSessionResponse | null>(null);
  const roleRef = useRef<DjSessionRole>("idle");
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastAppliedVersionRef = useRef(0);
  const lastPersistedDeckHashRef = useRef<string | null>(null);
  const lastOwnPersistVersionRef = useRef(0);
  const shouldApplyDeckStateRef = useRef(shouldApplyDeckState);
  shouldApplyDeckStateRef.current = shouldApplyDeckState;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSessionRestoredRef = useRef(onSessionRestored);
  onSessionRestoredRef.current = onSessionRestored;
  const onHostSessionLoadedRef = useRef(onHostSessionLoaded);
  onHostSessionLoadedRef.current = onHostSessionLoaded;

  const deckStateHash = deckStateContentHash(deckState);

  const [session, setSession] = useState<DjSessionResponse | null>(null);
  const [role, setRole] = useState<DjSessionRole>("idle");
  const [loading, setLoading] = useState(true);

  sessionRef.current = session;
  roleRef.current = role;

  const mergeSession = useCallback((incoming: DjSessionResponse) => {
    setSession((prev) => mergeSessionMetadata(prev, incoming));
  }, []);

  const applyRemoteSession = useCallback(
    (next: DjSessionResponse) => {
      const current = sessionRef.current;

      if (next.stateVersion <= lastAppliedVersionRef.current) {
        mergeSession(next);
        return;
      }

      lastAppliedVersionRef.current = next.stateVersion;

      const isHost = clientIdRef.current === (current?.hostClientId ?? next.hostClientId);
      if (
        shouldSkipDeckRestore(
          next,
          deckStateRef.current,
          isHost ? shouldApplyDeckStateRef.current : undefined,
          current
        )
      ) {
        mergeSession(next);
        return;
      }

      applyingRemoteRef.current = true;
      lastPersistedDeckHashRef.current = deckStateContentHash(next.deckState);
      dispatch({ type: "RESTORE_SESSION", state: next.deckState });
      setSession(next);
      applyingRemoteRef.current = false;
      onSessionRestoredRef.current?.();
    },
    [dispatch, mergeSession]
  );

  const joinSession = useCallback(async () => {
    if (!authTokenRef.current) {
      setSession(null);
      setRole("idle");
      setLoading(false);
      return;
    }

    try {
      const res = await authedFetchWithRetry("/api/dj/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientIdRef.current }),
      });

      if (res.status === 404) {
        setSession(null);
        setRole("idle");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to join session");
      }

      const body = (await res.json()) as DjSessionResponse & {
        role?: DjSessionRole;
      };
      const nextRole =
        body.role ??
        (body.hostClientId === clientIdRef.current ? "host" : "controller");

      const existingId = sessionRef.current?.id ?? null;
      const fullRestore = shouldFullRestoreOnJoin(existingId, body.id);

      lastAppliedVersionRef.current = Math.max(
        lastAppliedVersionRef.current,
        body.stateVersion
      );
      setRole(nextRole);

      if (fullRestore) {
        lastPersistedDeckHashRef.current = deckStateContentHash(body.deckState);
        applyingRemoteRef.current = true;
        dispatch({ type: "RESTORE_SESSION", state: body.deckState });
        applyingRemoteRef.current = false;
        setSession(body);
        onSessionRestoredRef.current?.();
        if (nextRole === "host") {
          onHostSessionLoadedRef.current?.(body);
        }
      } else {
        mergeSession(body);
      }
    } catch (err) {
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Failed to load DJ session"
      );
    } finally {
      setLoading(false);
    }
  }, [dispatch, mergeSession]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void joinSession();
    // Join once when the hook becomes enabled; token refresh must not re-join.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: enabled-only
  }, [enabled]);

  useEffect(() => {
    if (authToken !== null) return;
    setSession(null);
    setRole("idle");
    clearSessionRefs({
      lastAppliedVersionRef,
      lastPersistedDeckHashRef,
      lastOwnPersistVersionRef,
    });
    setLoading(false);
  }, [authToken]);

  useEffect(() => {
    if (!enabled || !session?.id) return;

    const channel = supabaseBrowser
      .channel(`dj-session-db-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dj_sessions",
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as DjSessionRow;
          if (!row || row.status !== "active") {
            if (row?.status === "ended") {
              setSession(null);
              setRole("idle");
            }
            return;
          }
          const next = rowToResponse(row);
          if (applyingRemoteRef.current) {
            mergeSession(next);
            return;
          }

          const isHost = roleRef.current === "host";
          if (
            shouldIgnoreOwnPersistEcho(
              isHost,
              next.stateVersion,
              lastOwnPersistVersionRef.current,
              next.deckState,
              deckStateRef.current
            )
          ) {
            mergeSession(next);
            return;
          }

          if (next.stateVersion > lastAppliedVersionRef.current) {
            applyRemoteSession(next);
          } else {
            mergeSession(next);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [applyRemoteSession, enabled, mergeSession, session?.id]);

  const persistNow = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || currentSession.status !== "active") return;
    if (applyingRemoteRef.current) return;

    const hashAtStart = deckStateContentHash(deckStateRef.current);
    if (hashAtStart === lastPersistedDeckHashRef.current) return;

    const isHost = currentSession.hostClientId === clientIdRef.current;
    const body: Record<string, unknown> = {
      sessionId: currentSession.id,
      stateVersion: currentSession.stateVersion,
      deckState: serializeDjDeckState(deckStateRef.current),
      clientId: clientIdRef.current,
    };

    if (isHost) {
      body.playbackSnapshot = getPlaybackSnapshot();
    }

    const res = await authedFetchWithRetry("/api/dj/session/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      const conflict = await res.json().catch(() => ({}));
      const latest = (conflict as { session?: DjSessionResponse }).session;
      if (
        latest &&
        shouldApplyPersistResponse(hashAtStart, deckStateRef.current)
      ) {
        applyRemoteSession(latest);
      }
      return;
    }

    if (!res.ok) return;

    const updated = (await res.json()) as DjSessionResponse;
    if (!shouldApplyPersistResponse(hashAtStart, deckStateRef.current)) {
      return;
    }

    lastAppliedVersionRef.current = updated.stateVersion;
    lastPersistedDeckHashRef.current = hashAtStart;
    if (isHost) {
      lastOwnPersistVersionRef.current = updated.stateVersion;
    }
    mergeSession(updated);
  }, [applyRemoteSession, getPlaybackSnapshot, mergeSession]);

  const flushPersist = useCallback(async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    await persistNow();
  }, [persistNow]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      void persistNow();
    }, STATE_PATCH_DEBOUNCE_MS);
  }, [persistNow]);

  useEffect(() => {
    if (!enabled || !session || role === "idle") return;
    if (applyingRemoteRef.current) return;
    if (deckStateHash === lastPersistedDeckHashRef.current) return;
    schedulePersist();
  }, [deckStateHash, enabled, role, schedulePersist, session]);

  useEffect(() => {
    if (!enabled || role !== "host" || !session?.id) return;

    const sendHeartbeat = () => {
      const hostDeviceId = hostDeviceIdRef?.current;
      if (!hostDeviceId) return;

      void authedFetchWithRetry("/api/dj/session/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          hostClientId: clientIdRef.current,
          hostDeviceId,
          playbackSnapshot: getPlaybackSnapshot(),
        }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const updated = (await res.json()) as DjSessionResponse;
          mergeSession(updated);
        })
        .catch(() => {
          /* heartbeat is best-effort */
        });
    };

    sendHeartbeat();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [
    enabled,
    getPlaybackSnapshot,
    hostDeviceIdRef,
    mergeSession,
    role,
    session?.id,
  ]);

  useEffect(() => {
    if (!enabled || role !== "host") return;

    const flushOnHide = () => {
      void flushPersist();
    };

    window.addEventListener("pagehide", flushOnHide);

    return () => {
      window.removeEventListener("pagehide", flushOnHide);
    };
  }, [enabled, flushPersist, role]);

  const startSession = useCallback(async () => {
    try {
      const res = await authedFetchWithRetry("/api/dj/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostClientId: clientIdRef.current,
          deckState: serializeDjDeckState(deckStateRef.current),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onErrorRef.current?.(
          (body as { error?: string }).error ?? "Failed to start session"
        );
        return false;
      }

      const created = (await res.json()) as DjSessionResponse;
      lastAppliedVersionRef.current = created.stateVersion;
      lastPersistedDeckHashRef.current = deckStateContentHash(created.deckState);
      lastOwnPersistVersionRef.current = created.stateVersion;
      setSession(created);
      setRole("host");
      return true;
    } catch (err) {
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Failed to start session"
      );
      return false;
    }
  }, []);

  const endSession = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return false;

    try {
      const res = await authedFetchWithRetry("/api/dj/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSession.id }),
      });

      if (!res.ok) {
        onErrorRef.current?.("Failed to end session");
        return false;
      }

      setSession(null);
      setRole("idle");
      clearSessionRefs({
        lastAppliedVersionRef,
        lastPersistedDeckHashRef,
        lastOwnPersistVersionRef,
      });
      return true;
    } catch (err) {
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Failed to end session"
      );
      return false;
    }
  }, []);

  const takeoverSession = useCallback(
    async (deviceId: string) => {
      const currentSession = sessionRef.current;
      if (!currentSession) return false;

      try {
        const res = await authedFetchWithRetry("/api/dj/session/takeover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentSession.id,
            hostClientId: clientIdRef.current,
            hostDeviceId: deviceId,
            playbackSnapshot: getPlaybackSnapshot(),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          onErrorRef.current?.(
            (body as { error?: string }).error ?? "Failed to take over session"
          );
          return false;
        }

        const updated = (await res.json()) as DjSessionResponse;
        lastAppliedVersionRef.current = updated.stateVersion;
        mergeSession(updated);
        setRole("host");
        return true;
      } catch (err) {
        onErrorRef.current?.(
          err instanceof Error ? err.message : "Failed to take over session"
        );
        return false;
      }
    },
    [getPlaybackSnapshot, mergeSession]
  );

  const hostStatus: DjHostStatus = session?.hostStatus ?? "offline";
  const isRemoteController = role === "controller";
  const canExecutePlayback =
    role === "host" || (isRemoteController && hostStatus === "online");

  return {
    clientId: clientIdRef.current,
    role,
    session,
    hostStatus,
    loading,
    canExecutePlayback,
    isRemoteController,
    startSession,
    endSession,
    takeoverSession,
    persistNow,
    flushPersist,
    applyRemoteSession,
  };
}
