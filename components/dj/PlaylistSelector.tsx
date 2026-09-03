"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeckTrack } from "@/lib/spotify/djDeckState";

const SESSION_KEY = "dj-deck-playlist-id";

type OwnedPlaylist = {
  id: string;
  name: string;
  trackCount: number | null;
};

export type PlaylistSelectorProps = {
  authToken: string;
  value: string | null;
  onChange: (playlist: { id: string; name: string }) => void;
  onQueueLoaded: (payload: {
    tracks: DeckTrack[];
    totalDurationMs: number;
  }) => void;
  disabled?: boolean;
};

export default function PlaylistSelector({
  authToken,
  value,
  onChange,
  onQueueLoaded,
  disabled = false,
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
        const res = await fetch(
          `/api/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (body as { error?: string }).error ?? "Failed to load tracks"
          );
        }
        onChange({ id: playlistId, name: playlistName });
        onQueueLoaded({
          tracks: (body as { tracks?: DeckTrack[] }).tracks ?? [],
          totalDurationMs:
            (body as { totalDurationMs?: number }).totalDurationMs ?? 0,
        });
        sessionStorage.setItem(SESSION_KEY, playlistId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tracks");
      } finally {
        setLoadingTracks(false);
      }
    },
    [authToken, onChange, onQueueLoaded]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await fetch("/api/spotify/playlists", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (body as { error?: string }).error ?? "Failed to list playlists"
          );
        }
        const list =
          ((body as { playlists?: OwnedPlaylist[] }).playlists ??
            []) as OwnedPlaylist[];
        if (cancelled) return;
        setPlaylists(list);

        const savedId = sessionStorage.getItem(SESSION_KEY);
        const initial =
          (savedId && list.find((p) => p.id === savedId)) ||
          list[0];
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
  }, [authToken]);

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
    <div className="flex flex-col gap-1 min-w-[240px]">
      <label className="text-xs uppercase tracking-wide text-neutral-500">
        Playlist
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => void handleSelect(e.target.value)}
        disabled={disabled || loadingTracks}
        className="bg-neutral-800 border border-neutral-600 rounded px-3 py-2 text-sm text-neutral-100 disabled:opacity-50"
      >
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.trackCount != null ? ` (${p.trackCount})` : ""}
          </option>
        ))}
      </select>
      {loadingTracks && (
        <span className="text-xs text-neutral-500">Loading queue…</span>
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
