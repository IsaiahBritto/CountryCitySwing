"use client";

import { useEffect } from "react";
import WaveformBar from "@/components/dj/WaveformBar";
import { formatTrackDuration } from "@/lib/spotify/djDeckState";
import { usePlaybackClock } from "@/lib/spotify/usePlaybackClockHook";
import type { SocialNowPlaying } from "@/lib/spotify/socialPlayback";

type NowPlayingPanelProps = {
  nowPlaying: SocialNowPlaying | null;
  hostOnline: boolean;
};

export default function NowPlayingPanel({
  nowPlaying,
  hostOnline,
}: NowPlayingPanelProps) {
  const trackUri = nowPlaying?.track.id ?? null;
  const { displayPositionMs, syncFromSdk, pause, resume } = usePlaybackClock({
    isPlaying: Boolean(nowPlaying?.isPlaying && hostOnline),
    durationMs: nowPlaying?.durationMs ?? 0,
    trackUri,
  });

  useEffect(() => {
    if (!nowPlaying) return;
    syncFromSdk(nowPlaying.positionMs, nowPlaying.isPlaying && hostOnline);
  }, [
    nowPlaying?.updatedAt,
    nowPlaying?.positionMs,
    nowPlaying?.isPlaying,
    nowPlaying,
    hostOnline,
    syncFromSdk,
  ]);

  useEffect(() => {
    if (nowPlaying?.isPlaying && hostOnline) {
      resume();
    } else {
      pause();
    }
  }, [nowPlaying?.isPlaying, hostOnline, pause, resume]);

  if (!nowPlaying?.track) {
    return (
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6 text-center">
        <p className="text-sm text-neutral-500">Nothing playing right now.</p>
      </section>
    );
  }

  const { track, durationMs, isPlaying } = nowPlaying;
  const displayDuration = durationMs > 0 ? durationMs : track.durationMs;

  return (
    <section
      className="rounded-xl border border-orange-500/40 bg-neutral-950/80 p-4 sm:p-6 space-y-4 ring-1 ring-white/10"
      aria-label="Now playing"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wide text-orange-400 font-semibold">
          Now Playing
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {hostOnline
            ? isPlaying
              ? "Live"
              : "Paused"
            : "DJ offline"}
        </span>
      </div>

      <WaveformBar
        accent="orange"
        positionMs={displayPositionMs}
        durationMs={displayDuration}
        isActive={isPlaying && hostOnline}
      />

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div
          className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-neutral-700 bg-[conic-gradient(from_0deg,#1a1a1a,#2a2a2a,#1a1a1a,#333,#1a1a1a)] flex items-center justify-center shadow-inner shrink-0 ${
            isPlaying && hostOnline ? "animate-[spin_3s_linear_infinite]" : ""
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-neutral-900 border-2 border-neutral-600" />
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium text-orange-300 truncate">
            {track.primaryArtist}
          </p>
          <p className="text-lg sm:text-xl font-semibold text-neutral-100 truncate">
            {track.name}
          </p>
          <p className="text-xs text-neutral-500 font-mono mt-1">
            {formatTrackDuration(displayPositionMs)} /{" "}
            {formatTrackDuration(displayDuration)}
          </p>
        </div>
      </div>
    </section>
  );
}
