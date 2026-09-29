"use client";

import { getSlotLabel } from "@/lib/comps/roundChain";
import type { RoundType } from "@/lib/comps/types";
import type { CompPlaylistEntry } from "@/lib/spotify/compPlaylistTypes";

function groupEntries(entries: CompPlaylistEntry[]) {
  const byRound = new Map<
    RoundType,
    Map<number, CompPlaylistEntry[]>
  >();

  for (const entry of entries) {
    let heats = byRound.get(entry.roundType);
    if (!heats) {
      heats = new Map();
      byRound.set(entry.roundType, heats);
    }
    const list = heats.get(entry.heatNumber) ?? [];
    list.push(entry);
    heats.set(entry.heatNumber, list);
  }

  return byRound;
}

function MatchIcon({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "font-semibold text-emerald-400"
          : "font-semibold text-red-400"
      }
      title={label}
      aria-label={label}
    >
      {ok ? "✓" : "✗"}
    </span>
  );
}

export default function GeneratedCompPlaylistPreview({
  entries,
}: {
  entries: CompPlaylistEntry[];
}) {
  if (entries.length === 0) return null;

  const grouped = groupEntries(entries);
  const roundOrder = entries.reduce<RoundType[]>((acc, e) => {
    if (!acc.includes(e.roundType)) acc.push(e.roundType);
    return acc;
  }, []);

  return (
    <details className="mt-4 rounded-lg border border-neutral-700 bg-neutral-900/50">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-neutral-200 hover:text-white">
        View generated playlist ({entries.length} songs)
      </summary>
      <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
        {roundOrder.map((roundType) => {
          const heats = grouped.get(roundType);
          if (!heats) return null;
          const heatNumbers = [...heats.keys()].sort((a, b) => a - b);
          return (
            <div key={roundType}>
              <h3 className="text-sm font-semibold text-white">
                {getSlotLabel(roundType)}
              </h3>
              {heatNumbers.map((heatNumber) => {
                const rows = heats.get(heatNumber) ?? [];
                return (
                  <div key={heatNumber} className="mt-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Heat {heatNumber}
                    </div>
                    <ul className="mt-1 space-y-2">
                      {rows.map((row) => {
                        const failParts: string[] = [];
                        if (!row.bpmOk) failParts.push("BPM");
                        if (!row.energyOk) failParts.push("energy");
                        const matchTitle = row.matchesSlot
                          ? `Matches: ${row.slotLabel}`
                          : `Does not match (${failParts.join(", ") || "criteria"}): ${row.slotLabel}`;
                        return (
                          <li
                            key={`${row.roundType}-${row.heatNumber}-${row.songNumber}-${row.track.id}`}
                            className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-neutral-200">
                              <span className="shrink-0 text-neutral-500">
                                Song {row.songNumber}
                              </span>
                              <MatchIcon
                                ok={row.matchesSlot}
                                label={matchTitle}
                              />
                              <span className="min-w-0 flex-1">
                                {row.track.name}
                                <span className="text-neutral-500">
                                  {" "}
                                  · {row.track.primaryArtist}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-neutral-400">
                                BPM {Math.round(row.bpm * 10) / 10}
                                {" · "}
                                Energy {(Math.round(row.energy * 100) / 100).toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-500">
                              Expected: {row.slotLabel}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </details>
  );
}
