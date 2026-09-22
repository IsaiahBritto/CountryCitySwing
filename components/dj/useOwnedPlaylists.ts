"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiError, authedFetchWithRetry } from "@/lib/clientAuth";

export type OwnedPlaylist = {
  id: string;
  name: string;
  trackCount: number | null;
};

const SESSION_CACHE_KEY = "dj-owned-playlists-cache-v1";

type SessionCache = {
  playlists: OwnedPlaylist[];
  fetchedAt: string;
  quotaBlockedUntil?: string | null;
};

function readSessionCache(): SessionCache | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionCache;
  } catch {
    return null;
  }
}

function writeSessionCache(data: SessionCache): void {
  sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
}

export function useOwnedPlaylists(enabled: boolean) {
  const [playlists, setPlaylists] = useState<OwnedPlaylist[]>(() => {
    return readSessionCache()?.playlists ?? [];
  });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [quotaBlockedUntil, setQuotaBlockedUntil] = useState<string | null>(
    null
  );
  const fetchInFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      if (!enabled) return;
      if (fetchInFlight.current && !options?.force) {
        await fetchInFlight.current;
        return;
      }

      const run = async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await authedFetchWithRetry("/api/spotify/playlists");
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            const cached = readSessionCache();
            if (cached?.playlists.length) {
              setPlaylists(cached.playlists);
              setStale(true);
              setQuotaBlockedUntil(cached.quotaBlockedUntil ?? null);
              setError(
                (body as { error?: string }).error ??
                  "Spotify sync unavailable — showing cached library"
              );
              return;
            }
            throw new Error(
              (body as { error?: string }).error ?? (await apiError(res))
            );
          }
          const list =
            ((body as { playlists?: OwnedPlaylist[] }).playlists ??
              []) as OwnedPlaylist[];
          setPlaylists(list);
          setStale(Boolean((body as { stale?: boolean }).stale));
          setQuotaBlockedUntil(
            ((body as { quotaBlockedUntil?: string | null }).quotaBlockedUntil ??
              null) as string | null
          );
          writeSessionCache({
            playlists: list,
            fetchedAt: new Date().toISOString(),
            quotaBlockedUntil:
              (body as { quotaBlockedUntil?: string | null }).quotaBlockedUntil ??
              null,
          });
        } catch (err) {
          const cached = readSessionCache();
          if (cached?.playlists.length) {
            setPlaylists(cached.playlists);
            setStale(true);
            setError(
              err instanceof Error
                ? err.message
                : "Failed to load playlists — showing cached library"
            );
          } else {
            setError(err instanceof Error ? err.message : "Failed to load playlists");
          }
        } finally {
          setLoading(false);
        }
      };

      const promise = run();
      fetchInFlight.current = promise;
      try {
        await promise;
      } finally {
        fetchInFlight.current = null;
      }
    },
    [enabled]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    playlists,
    loading,
    error,
    stale,
    quotaBlockedUntil,
    refresh: () => load({ force: true }),
  };
}
