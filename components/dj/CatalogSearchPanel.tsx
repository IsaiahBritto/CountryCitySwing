"use client";

import { useCallback, useState } from "react";
import { apiError, authedFetchWithRetry } from "@/lib/clientAuth";
import { musicApiExtraHeaders } from "@/lib/clientMusicApi";
import { useMusicPlatform } from "@/components/music/MusicPlatformProvider";
import type { DeckId, DeckTrack } from "@/lib/spotify/djDeckState";

type SearchHit = {
  id: string;
  uri: string;
  name: string;
  primaryArtist: string;
  durationMs: number;
};

export type CatalogSearchPanelProps = {
  deckId: DeckId;
  disabled?: boolean;
  musicUserToken?: string | null;
  storefrontId?: string | null;
  onAddToQueue: (deck: DeckId, track: DeckTrack) => void;
};

export default function CatalogSearchPanel({
  deckId,
  disabled = false,
  musicUserToken = null,
  storefrontId = null,
  onAddToQueue,
}: CatalogSearchPanelProps) {
  const { isAppleMusic, apiPaths } = useMusicPlatform();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const path = `${apiPaths.musicSearchPath()}?q=${encodeURIComponent(q)}`;
      const res = await authedFetchWithRetry(path, {
        headers: musicApiExtraHeaders({
          appleMusic: isAppleMusic,
          musicUserToken,
          storefrontId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (body as { error?: string }).error ?? (await apiError(res))
        );
      }
      setResults(((body as { tracks?: SearchHit[] }).tracks ?? []) as SearchHit[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [musicUserToken, query, storefrontId]);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 space-y-2">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
        Catalog search
      </p>
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder="Search Apple Music…"
          disabled={disabled}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={disabled || loading || query.trim().length < 2}
          className="px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-sm text-white disabled:opacity-50"
        >
          {loading ? "…" : "Search"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
        {results.map((track) => (
          <li
            key={track.id}
            className="flex items-center justify-between gap-2 py-1 border-b border-neutral-800/80"
          >
            <span className="truncate text-neutral-200">
              {track.name}{" "}
              <span className="text-neutral-500">· {track.primaryArtist}</span>
            </span>
            <button
              type="button"
              disabled={disabled}
              className="shrink-0 text-xs text-amber-400 hover:text-amber-300"
              onClick={() =>
                onAddToQueue(deckId, {
                  id: track.id,
                  uri: track.uri,
                  name: track.name,
                  primaryArtist: track.primaryArtist,
                  durationMs: track.durationMs,
                  isrc: null,
                })
              }
            >
              + Queue
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
