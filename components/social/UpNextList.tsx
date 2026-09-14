"use client";

import type { SocialUpNextTrack } from "@/lib/spotify/socialPlayback";

type UpNextListProps = {
  tracks: SocialUpNextTrack[];
};

function genreBadgeClass(genre: SocialUpNextTrack["genre"]): string {
  switch (genre) {
    case "cs":
      return "bg-amber-900/40 text-amber-200 border-amber-600/40";
    case "wcs":
      return "bg-blue-900/40 text-blue-200 border-blue-600/40";
    case "ld":
      return "bg-emerald-900/40 text-emerald-200 border-emerald-600/40";
    default:
      return "bg-neutral-800 text-neutral-400 border-neutral-600";
  }
}

export default function UpNextList({ tracks }: UpNextListProps) {
  return (
    <section
      className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-4 sm:p-5 space-y-3"
      aria-label="Up next"
    >
      <h2 className="text-xs uppercase tracking-wide text-neutral-400 font-semibold">
        Up Next
      </h2>

      {tracks.length === 0 ? (
        <p className="text-sm text-neutral-500">No upcoming tracks.</p>
      ) : (
        <ol className="space-y-2">
          {tracks.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 min-w-0"
            >
              <span className="text-xs font-mono text-neutral-500 w-5 shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-100 truncate">{track.name}</p>
                <p className="text-xs text-neutral-500 truncate">
                  {track.primaryArtist}
                </p>
              </div>
              {track.genreLabel ? (
                <span
                  className={`shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${genreBadgeClass(track.genre)}`}
                >
                  {track.genreLabel}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-neutral-600">—</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
