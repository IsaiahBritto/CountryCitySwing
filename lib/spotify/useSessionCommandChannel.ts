"use client";

import { useCallback, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetchWithRetry } from "@/lib/clientAuth";
import type { DjSessionCommandBroadcast } from "@/lib/spotify/djSessionCommands";

export function sessionChannelName(sessionId: string): string {
  return `dj-session-${sessionId}`;
}

export function useSessionCommandChannel(opts: {
  sessionId: string | null;
  clientId: string;
  enabled: boolean;
  onCommand?: (broadcast: DjSessionCommandBroadcast) => void;
}) {
  const { sessionId, clientId, enabled, onCommand } = opts;
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(
    null
  );
  const subscribedRef = useRef(false);
  const subscribeReadyRef = useRef<Promise<void> | null>(null);
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !sessionId) {
      subscribedRef.current = false;
      subscribeReadyRef.current = null;
      return;
    }

    subscribedRef.current = false;
    let resolveReady: (() => void) | undefined;
    subscribeReadyRef.current = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const channel = supabaseBrowser
      .channel(sessionChannelName(sessionId))
      .on("broadcast", { event: "session_command" }, (payload) => {
        if (!onCommandRef.current) return;
        const broadcast = payload.payload as DjSessionCommandBroadcast | undefined;
        if (!broadcast?.commandId || !broadcast.command) return;
        if (broadcast.clientId === clientId) return;
        if (processedIdsRef.current.has(broadcast.commandId)) return;
        processedIdsRef.current.add(broadcast.commandId);
        if (processedIdsRef.current.size > 200) {
          const ids = [...processedIdsRef.current];
          processedIdsRef.current = new Set(ids.slice(-100));
        }
        onCommandRef.current(broadcast);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
          resolveReady?.();
        }
      });

    channelRef.current = channel;

    return () => {
      subscribedRef.current = false;
      subscribeReadyRef.current = null;
      supabaseBrowser.removeChannel(channel);
      channelRef.current = null;
    };
  }, [clientId, enabled, sessionId]);

  const broadcastCommand = useCallback(
    async (broadcast: DjSessionCommandBroadcast) => {
      if (!sessionId) return;
      processedIdsRef.current.add(broadcast.commandId);

      if (subscribeReadyRef.current) {
        await subscribeReadyRef.current;
      }

      if (!channelRef.current || !subscribedRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[useSessionCommandChannel] broadcast skipped — channel not subscribed"
          );
        }
        return;
      }

      await channelRef.current.send({
        type: "broadcast",
        event: "session_command",
        payload: broadcast,
      });
    },
    [sessionId]
  );

  return { broadcastCommand };
}

export async function postSessionCommand(params: {
  sessionId: string;
  clientId: string;
  command: unknown;
}): Promise<{
  ok: boolean;
  broadcast?: DjSessionCommandBroadcast;
  executeLocally?: boolean;
  error?: string;
}> {
  const res = await authedFetchWithRetry("/api/dj/session/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: params.sessionId,
      clientId: params.clientId,
      command: params.command,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: (body as { error?: string }).error ?? "Command failed",
    };
  }

  return {
    ok: true,
    broadcast: (body as { broadcast?: DjSessionCommandBroadcast }).broadcast,
    executeLocally: Boolean(
      (body as { executeLocally?: boolean }).executeLocally
    ),
  };
}
