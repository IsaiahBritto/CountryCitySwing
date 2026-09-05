"use client";

import { useCallback, useEffect, useState } from "react";
import { apiError, authedFetchWithRetry } from "@/lib/clientAuth";
import type { DeckId, DeckTrack } from "@/lib/spotify/djDeckState";

function sessionKey(deckId: DeckId) {
  return `dj-deck-playlist-id-${deckId}`;
}

type OwnedPlaylist = {
  id: string;
  name: string;
  trackCount: number | null;
};

export type PlaylistSelectorProps = {
  deckId: DeckId;
  value: string | null;
  onChange: (deck: DeckId, playlist: { id: string; name: string }) => void;
  onPlaylistLoaded: (
    deck: DeckId,
    payload: { tracks: DeckTrack[]; totalDurationMs: number }
  ) => void;
  disabled?: boolean;
  disableAutoLoad?: boolean;
  tracksLoaded?: boolean;
};

export default function PlaylistSelector({
  deckId,
  value,
  onChange,
  onPlaylistLoaded,
  disabled = false,
  disableAutoLoad = false,
  tracksLoaded = false,
}: PlaylistSelectorProps) {
  const [playlists, setPlaylists] = useState<OwnedPlaylist[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTracks = useCallback(
    async (playlistId: string, playlistName: string) => {
      setLoadingTracks(true);
      setError(null);
      try {
        const res = await authedFetchWithRetry(
          `/api/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (body as { error?: string }).error ?? (await apiError(res))
          );
        }
        onChange(deckId, { id: playlistId, name: playlistName });
        onPlaylistLoaded(deckId, {
          tracks: (body as { tracks?: DeckTrack[] }).tracks ?? [],
          totalDurationMs:
            (body as { totalDurationMs?: number }).totalDurationMs ?? 0,
        });
        sessionStorage.setItem(sessionKey(deckId), playlistId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tracks");
      } finally {
        setLoadingTracks(false);
      }
    },
    [deckId, onChange, onPlaylistLoaded]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await authedFetchWithRetry("/api/spotify/playlists");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (body as { error?: string }).error ?? (await apiError(res))
          );
        }
        const list =
          ((body as { playlists?: OwnedPlaylist[] }).playlists ??
            []) as OwnedPlaylist[];
        if (cancelled) return;
        setPlaylists(list);

        if (value || disableAutoLoad || tracksLoaded) return;

        const savedId = sessionStorage.getItem(sessionKey(deckId));
        const initial =
          (savedId && list.find((p) => p.id === savedId)) ||
          (deckId === "A" ? list[0] : null);
        if (initial) {
          await loadTracks(initial.id, initial.name);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load playlists");
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [deckId]);

  const handleSelect = async (playlistId: string) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return;
    await loadTracks(playlist.id, playlist.name);
  };

  if (loadingList) {
    return <span className="text-sm text-neutral-400">Loading playlists…</span>;
  }

  if (playlists.length === 0) {
    return (
      <span className="text-sm text-neutral-400">
        No owned playlists — generate one on /spotify first.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0 w-full">
      <label className="text-xs uppercase tracking-wide text-neutral-500">
        <span className="sm:hidden">{deckId}</span>
        <span className="hidden sm:inline">Player {deckId} playlist</span>
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => void handleSelect(e.target.value)}
        disabled={disabled || loadingTracks}
        className="bg-neutral-800 border border-neutral-600 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-neutral-100 disabled:opacity-50 w-full min-w-0"
      >
        <option value="" disabled>
          Select playlist…
        </option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.trackCount != null ? ` (${p.trackCount})` : ""}
          </option>
        ))}
      </select>
      {loadingTracks && (
        <span className="text-xs text-neutral-500">Loading playlist…</span>
      )}
      {error && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">{error}</span>
          <button
            type="button"
            className="text-xs text-amber-400 underline"
            onClick={() => {
              const current = playlists.find((p) => p.id === value);
              if (current) void loadTracks(current.id, current.name);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
