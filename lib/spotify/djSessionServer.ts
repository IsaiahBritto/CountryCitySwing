import { supabaseServer } from "@/lib/supabaseServer";
import {
  effectiveHostStatus,
  isHostStale,
  type DjHostStatus,
  type DjPlaybackSnapshot,
  type DjSessionRow,
} from "@/lib/spotify/djSession";
import {
  serializeDjDeckState,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";

export async function getActiveSessionRow(): Promise<DjSessionRow | null> {
  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .select("*")
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return (data as DjSessionRow | null) ?? null;
}

export async function getSessionRowById(
  sessionId: string
): Promise<DjSessionRow | null> {
  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return (data as DjSessionRow | null) ?? null;
}

export async function refreshHostStatus(
  session: DjSessionRow
): Promise<DjSessionRow> {
  if (session.host_status !== "online") return session;
  if (!isHostStale(session.host_last_seen_at)) return session;

  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .update({
      host_status: "offline" as DjHostStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("status", "active")
    .select("*")
    .single();

  if (error) throw error;
  return data as DjSessionRow;
}

export async function resolveHostDeviceId(
  sessionId: string | null | undefined,
  deviceId: string | undefined
): Promise<{ deviceId: string } | { error: string; status: number }> {
  if (!sessionId) {
    if (!deviceId?.trim()) {
      return { error: "deviceId is required", status: 400 };
    }
    return { deviceId: deviceId.trim() };
  }

  const session = await getSessionRowById(sessionId);
  if (!session || session.status !== "active") {
    return { error: "Active session not found", status: 404 };
  }

  const refreshed = await refreshHostStatus(session);
  if (!refreshed.host_device_id) {
    return { error: "Playback host has no device", status: 409 };
  }

  return { deviceId: refreshed.host_device_id };
}

export async function createSession(params: {
  startedBy: string;
  hostClientId: string;
  deckState: DjDeckState;
  playbackSnapshot?: DjPlaybackSnapshot;
}): Promise<DjSessionRow> {
  const existing = await getActiveSessionRow();
  if (existing) {
    throw new Error("ACTIVE_SESSION_EXISTS");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .insert({
      status: "active",
      started_by: params.startedBy,
      host_client_id: params.hostClientId,
      host_status: "offline",
      host_last_seen_at: now,
      deck_state: serializeDjDeckState(params.deckState),
      playback_snapshot: params.playbackSnapshot ?? {},
      state_version: 1,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as DjSessionRow;
}

export async function endSession(sessionId: string): Promise<DjSessionRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .update({
      status: "ended",
      ended_at: now,
      host_status: "offline",
      updated_at: now,
    })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as DjSessionRow | null) ?? null;
}

export async function patchSessionState(params: {
  sessionId: string;
  expectedVersion: number;
  deckState: DjDeckState;
  playbackSnapshot?: DjPlaybackSnapshot;
  clientId: string;
  isHost: boolean;
}): Promise<DjSessionRow | "VERSION_CONFLICT" | "NOT_FOUND"> {
  const session = await getSessionRowById(params.sessionId);
  if (!session || session.status !== "active") return "NOT_FOUND";

  if (session.state_version !== params.expectedVersion) {
    return "VERSION_CONFLICT";
  }

  const update: Record<string, unknown> = {
    deck_state: serializeDjDeckState(params.deckState),
    state_version: session.state_version + 1,
    updated_at: new Date().toISOString(),
  };

  if (params.playbackSnapshot) {
    update.playback_snapshot = params.playbackSnapshot;
  }

  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .update(update)
    .eq("id", params.sessionId)
    .eq("state_version", params.expectedVersion)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) return "VERSION_CONFLICT";
  return data as DjSessionRow;
}

export async function postHeartbeat(params: {
  sessionId: string;
  hostClientId: string;
  hostDeviceId: string;
  playbackSnapshot: DjPlaybackSnapshot;
}): Promise<DjSessionRow | "NOT_FOUND" | "NOT_HOST"> {
  const session = await getSessionRowById(params.sessionId);
  if (!session || session.status !== "active") return "NOT_FOUND";
  if (session.host_client_id !== params.hostClientId) return "NOT_HOST";

  const now = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .update({
      host_device_id: params.hostDeviceId,
      host_status: "online",
      host_last_seen_at: now,
      playback_snapshot: params.playbackSnapshot,
      updated_at: now,
    })
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (error) throw error;
  return data as DjSessionRow;
}

export async function takeoverSession(params: {
  sessionId: string;
  hostClientId: string;
  hostDeviceId: string;
  playbackSnapshot?: DjPlaybackSnapshot;
}): Promise<DjSessionRow | "NOT_FOUND"> {
  const session = await getSessionRowById(params.sessionId);
  if (!session || session.status !== "active") return "NOT_FOUND";

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    host_client_id: params.hostClientId,
    host_device_id: params.hostDeviceId,
    host_status: "online",
    host_last_seen_at: now,
    updated_at: now,
  };

  if (params.playbackSnapshot) {
    update.playback_snapshot = params.playbackSnapshot;
  }

  const { data, error } = await supabaseServer
    .from("dj_sessions")
    .update(update)
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (error) throw error;
  return data as DjSessionRow;
}

export function canExecutePlayback(session: DjSessionRow): boolean {
  return effectiveHostStatus(session) === "online" && !!session.host_device_id;
}
