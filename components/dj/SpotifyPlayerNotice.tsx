"use client";

import type { SpotifyPlayerErrorAction } from "@/lib/spotify/spotifyApiErrors";
import type { SpotifyPlayerNotice as SpotifyPlayerNoticeType } from "@/lib/spotify/useSpotifyPlayer";

type SpotifyPlayerNoticeProps = {
  notice: SpotifyPlayerNoticeType;
  onDismiss?: () => void;
  onAction?: (action: SpotifyPlayerErrorAction) => void;
};

const ACTION_LABELS: Record<SpotifyPlayerErrorAction, string> = {
  reconnect_spotify: "Reconnect Spotify",
  sign_in: "Sign in again",
  reconnect_deck: "Reconnect player",
};

export default function SpotifyPlayerNotice({
  notice,
  onDismiss,
  onAction,
}: SpotifyPlayerNoticeProps) {
  const isWarning = notice.severity === "warning";
  const borderClass = isWarning
    ? "border-amber-700/50 bg-amber-950/30"
    : "border-red-800/50 bg-red-950/30";
  const titleClass = isWarning ? "text-amber-100" : "text-red-200";
  const messageClass = isWarning ? "text-amber-100/90" : "text-red-200/90";
  const buttonClass = isWarning
    ? "bg-amber-600 hover:bg-amber-500"
    : "bg-red-700 hover:bg-red-600";

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm flex flex-wrap items-start gap-3 ${borderClass}`}
      role="status"
    >
      <div className="flex-1 min-w-[200px] space-y-1">
        <p className={`font-medium ${titleClass}`}>{notice.error.title}</p>
        <p className={`text-xs sm:text-sm ${messageClass}`}>
          {notice.error.message}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {notice.error.action && onAction && (
          <button
            type="button"
            onClick={() => onAction(notice.error.action!)}
            className={`px-3 py-1 rounded text-white text-xs font-medium ${buttonClass}`}
          >
            {ACTION_LABELS[notice.error.action]}
          </button>
        )}
        {isWarning && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1 rounded border border-neutral-600 text-neutral-300 text-xs hover:bg-neutral-800"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
