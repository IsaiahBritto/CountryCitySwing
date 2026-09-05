"use client";

import type { DjHostStatus, DjSessionRole } from "@/lib/spotify/djSession";

type SessionBarProps = {
  role: DjSessionRole;
  hostStatus: DjHostStatus;
  sessionActive: boolean;
  audioUnlocked: boolean;
  starting?: boolean;
  ending?: boolean;
  takingOver?: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onTakeover: () => void;
};

export default function SessionBar({
  role,
  hostStatus,
  sessionActive,
  audioUnlocked,
  starting = false,
  ending = false,
  takingOver = false,
  onStartSession,
  onEndSession,
  onTakeover,
}: SessionBarProps) {
  if (!sessionActive && role === "idle") {
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-100">No active session</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            Start a session to save deck state across refreshes and control from
            other devices.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartSession}
          disabled={!audioUnlocked || starting}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          {starting ? "Starting…" : "Start Session"}
        </button>
      </div>
    );
  }

  if (role === "host") {
    return (
      <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-emerald-100">
            Session active · You are hosting
          </p>
          <p className="text-xs text-emerald-200/70 mt-0.5">
            Audio plays on this device. Other admins can control remotely.
          </p>
        </div>
        <button
          type="button"
          onClick={onEndSession}
          disabled={ending}
          className="px-4 py-2 rounded-lg border border-neutral-600 hover:bg-neutral-800 text-neutral-200 text-sm"
        >
          {ending ? "Ending…" : "End Session"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-sky-800/50 bg-sky-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-sky-100">
            Session active · Controlling remotely
          </p>
          <p className="text-xs text-sky-200/70 mt-0.5">
            Audio is playing on another device. Your controls won&apos;t move
            playback here.
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            hostStatus === "online"
              ? "bg-emerald-900/50 text-emerald-300"
              : "bg-amber-900/50 text-amber-300"
          }`}
        >
          Host {hostStatus}
        </span>
      </div>

      {hostStatus === "offline" && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-100">
            Playback host is offline. Take over to resume audio on this device.
          </p>
          <button
            type="button"
            onClick={onTakeover}
            disabled={takingOver}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {takingOver ? "Taking over…" : "Take over playback"}
          </button>
        </div>
      )}
    </div>
  );
}
