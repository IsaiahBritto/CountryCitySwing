import {
  deserializeDjDeckState,
  INITIAL_DJ_DECK_STATE,
  type DeckId,
  type DjDeckState,
} from "@/lib/spotify/djDeckState";

export type DjSessionStatus = "active" | "ended";
export type DjHostStatus = "online" | "offline";

export type DjPlaybackSnapshot = {
  isPlaying: boolean;
  positionMs: number;
  currentTrackUri: string | null;
  activeDeck: DeckId;
  updatedAt: string;
};

export type DjSessionRow = {
  id: string;
  status: DjSessionStatus;
  started_by: string;
  started_at: string;
  ended_at: string | null;
  host_client_id: string;
  host_device_id: string | null;
  host_status: DjHostStatus;
  host_last_seen_at: string | null;
  deck_state: unknown;
  playback_snapshot: unknown;
  state_version: number;
  updated_at: string;
};

export type DjSessionRole = "idle" | "host" | "controller";

export const HOST_STALE_MS = 15_000;
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const STATE_PATCH_DEBOUNCE_MS = 500;

export const DJ_CLIENT_ID_STORAGE_KEY = "ccs-dj-client-id";

export function createEmptyPlaybackSnapshot(activeDeck: DeckId = "A"): DjPlaybackSnapshot {
  return {
    isPlaying: false,
    positionMs: 0,
    currentTrackUri: null,
    activeDeck,
    updatedAt: new Date().toISOString(),
  };
}

export function parsePlaybackSnapshot(raw: unknown): DjPlaybackSnapshot {
  if (!raw || typeof raw !== "object") {
    return createEmptyPlaybackSnapshot();
  }
  const o = raw as Record<string, unknown>;
  const activeDeck = o.activeDeck === "B" ? "B" : "A";
  return {
    isPlaying: o.isPlaying === true,
    positionMs:
      typeof o.positionMs === "number" && Number.isFinite(o.positionMs)
        ? Math.max(0, o.positionMs)
        : 0,
    currentTrackUri:
      typeof o.currentTrackUri === "string" ? o.currentTrackUri : null,
    activeDeck,
    updatedAt:
      typeof o.updatedAt === "string"
        ? o.updatedAt
        : new Date().toISOString(),
  };
}

export function validateDeckState(raw: unknown): DjDeckState {
  return deserializeDjDeckState(raw);
}

export function sessionDeckState(raw: unknown): DjDeckState {
  try {
    return validateDeckState(raw);
  } catch {
    return INITIAL_DJ_DECK_STATE;
  }
}

export function inferSessionRole(
  session: DjSessionRow | null,
  clientId: string
): DjSessionRole {
  if (!session || session.status !== "active") return "idle";
  return session.host_client_id === clientId ? "host" : "controller";
}

export function isHostStale(
  hostLastSeenAt: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!hostLastSeenAt) return true;
  const seen = Date.parse(hostLastSeenAt);
  if (Number.isNaN(seen)) return true;
  return nowMs - seen > HOST_STALE_MS;
}

export function effectiveHostStatus(session: DjSessionRow): DjHostStatus {
  if (session.host_status === "offline") return "offline";
  if (isHostStale(session.host_last_seen_at)) return "offline";
  return "online";
}

export function canExecutePlayback(session: DjSessionRow): boolean {
  return effectiveHostStatus(session) === "online" && !!session.host_device_id;
}

export function toSessionResponse(session: DjSessionRow) {
  return {
    id: session.id,
    status: session.status,
    startedBy: session.started_by,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    hostClientId: session.host_client_id,
    hostDeviceId: session.host_device_id,
    hostStatus: effectiveHostStatus(session),
    hostLastSeenAt: session.host_last_seen_at,
    deckState: sessionDeckState(session.deck_state),
    playbackSnapshot: parsePlaybackSnapshot(session.playback_snapshot),
    stateVersion: session.state_version,
    updatedAt: session.updated_at,
  };
}

export type DjSessionResponse = ReturnType<typeof toSessionResponse>;
