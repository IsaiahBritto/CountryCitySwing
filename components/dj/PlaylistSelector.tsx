"use client";

import { useCallback, useEffect, useState } from "react";
import { apiError, authedFetchWithRetry } from "@/lib/clientAuth";
import type { OwnedPlaylist } from "@/components/dj/useOwnedPlaylists";
import type { DeckId, DeckTrack } from "@/lib/spotify/djDeckState";

function sessionKey(deckId: DeckId) {
  return `dj-deck-playlist-id-${deckId}`;
}

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
  ownedPlaylists: OwnedPlaylist[];
  playlistsLoading?: boolean;
  playlistsError?: string | null;
  playlistsStale?: boolean;
  quotaBlockedUntil?: string | null;
  onRefreshPlaylists?: () => void;
  activeSocialPlaylistId?: string | null;
};

export default function PlaylistSelector({
  deckId,
  value,
  onChange,
  onPlaylistLoaded,
  disabled = false,
  disableAutoLoad = false,
  tracksLoaded = false,
  ownedPlaylists,
  playlistsLoading = false,
  playlistsError = null,
  playlistsStale = false,
  quotaBlockedUntil = null,
  onRefreshPlaylists,
  activeSocialPlaylistId = null,
}: PlaylistSelectorProps) {
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackWarning, setTrackWarning] = useState<string | null>(null);

  const loadTracks = useCallback(
    async (playlistId: string, playlistName: string) => {
      setLoadingTracks(true);
      setError(null);
      setTrackWarning(null);
      try {
        const useSnapshot =
          activeSocialPlaylistId != null &&
          playlistId === activeSocialPlaylistId;
        const path = useSnapshot
          ? "/api/spotify/active-playlist/deck-tracks"
          : `/api/spotify/playlists/${encodeURIComponent(playlistId)}/tracks`;

        const res = await authedFetchWithRetry(path);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (body as { error?: string }).error ?? (await apiError(res))
          );
        }
        if ((body as { warning?: string }).warning) {
          setTrackWarning((body as { warning?: string }).warning ?? null);
        }
        if ((body as { stale?: boolean }).stale) {
          setTrackWarning(
            (body as { warning?: string }).warning ??
              "Showing cached playlist data while Spotify sync is paused."
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
    [
      activeSocialPlaylistId,
      deckId,
      onChange,
      onPlaylistLoaded,
    ]
  );

  useEffect(() => {
    if (value || disableAutoLoad || tracksLoaded) return;
    if (playlistsLoading || ownedPlaylists.length === 0) return;

    const savedId = sessionStorage.getItem(sessionKey(deckId));
    const initial =
      (savedId && ownedPlaylists.find((p) => p.id === savedId)) ||
      (deckId === "A" ? ownedPlaylists[0] : null);
    if (initial) {
      void loadTracks(initial.id, initial.name);
    }
  }, [
    deckId,
    disableAutoLoad,
    loadTracks,
    ownedPlaylists,
    playlistsLoading,
    tracksLoaded,
    value,
  ]);

  const handleSelect = async (playlistId: string) => {
    const playlist = ownedPlaylists.find((p) => p.id === playlistId);
    if (!playlist) return;
    await loadTracks(playlist.id, playlist.name);
  };

  const quotaBanner =
    quotaBlockedUntil && new Date(quotaBlockedUntil).getTime() > Date.now()
      ? `Spotify library sync paused until ${new Date(quotaBlockedUntil).toLocaleTimeString()}. Cached data remains available.`
      : playlistsStale
        ? "Showing cached Spotify library — sync will resume when quota allows."
        : null;

  if (playlistsLoading && ownedPlaylists.length === 0) {
    return <p className="text-sm text-neutral-400">Loading playlists…</p>;
  }

  return (
    <div className="space-y-2">
      {quotaBanner ? (
        <p className="text-xs text-amber-400/90" role="status">
          {quotaBanner}
        </p>
      ) : null}
      {(playlistsError || error) && ownedPlaylists.length > 0 ? (
        <p className="text-xs text-amber-400/90">{playlistsError ?? error}</p>
      ) : null}
      {playlistsError && ownedPlaylists.length === 0 ? (
        <p className="text-sm text-red-400">{playlistsError}</p>
      ) : null}
      {trackWarning ? (
        <p className="text-xs text-amber-400/90">{trackWarning}</p>
      ) : null}
      <div className="flex gap-2 items-center">
        <select
          className="flex-1 min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
          value={value ?? ""}
          disabled={disabled || loadingTracks || ownedPlaylists.length === 0}
          onChange={(e) => void handleSelect(e.target.value)}
        >
          <option value="" disabled>
            Select playlist
          </option>
          {ownedPlaylists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.trackCount != null ? ` (${p.trackCount})` : ""}
            </option>
          ))}
        </select>
        {onRefreshPlaylists ? (
          <button
            type="button"
            className="text-xs text-neutral-400 hover:text-white shrink-0"
            disabled={disabled || playlistsLoading}
            onClick={() => onRefreshPlaylists()}
          >
            Refresh
          </button>
        ) : null}
      </div>
      {loadingTracks ? (
        <p className="text-xs text-neutral-500">Loading tracks…</p>
      ) : null}
    </div>
  );
}
