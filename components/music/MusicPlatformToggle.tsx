"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DjMusicProvider } from "@/lib/dj/musicProvider";
import { musicAdminPath } from "@/lib/music/providerSegments";
import { authedFetch, apiError } from "@/lib/clientAuth";
import { useMusicPlatform } from "@/components/music/MusicPlatformProvider";

type AdminPlatformResponse = {
  provider: DjMusicProvider;
  source: "env" | "database";
  canChange: boolean;
  blockReason: string | null;
};

export function MusicPlatformToggle() {
  const router = useRouter();
  const { provider, refresh, source } = useMusicPlatform();
  const [adminMeta, setAdminMeta] = useState<AdminPlatformResponse | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin/music/platform");
      if (!res.ok) return;
      const body = (await res.json()) as AdminPlatformResponse;
      setAdminMeta(body);
    } catch {
      /* non-admin viewers skip */
    }
  }, []);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin, provider]);

  const setProvider = async (next: DjMusicProvider) => {
    if (next === provider) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/music/platform", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: next }),
      });
      if (!res.ok) {
        throw new Error(await apiError(res));
      }
      await refresh();
      await loadAdmin();
      router.replace(musicAdminPath(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch provider");
    } finally {
      setBusy(false);
    }
  };

  const locked = adminMeta?.source === "env" || source === "env";
  const canChange = adminMeta?.canChange !== false && !locked;

  return (
    <div className="mb-6 rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">
            Music platform
          </h2>
          <p className="text-xs text-neutral-400">
            Controls DJ deck playback and social request backend for this site.
          </p>
        </div>
        <div className="flex rounded-lg border border-neutral-600 p-0.5">
          <button
            type="button"
            disabled={busy || !canChange}
            onClick={() => void setProvider("spotify")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              provider === "spotify"
                ? "bg-green-700 text-white"
                : "text-neutral-300 hover:bg-neutral-800"
            } disabled:opacity-50`}
          >
            Spotify
          </button>
          <button
            type="button"
            disabled={busy || !canChange}
            onClick={() => void setProvider("apple_music")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              provider === "apple_music"
                ? "bg-pink-700 text-white"
                : "text-neutral-300 hover:bg-neutral-800"
            } disabled:opacity-50`}
          >
            Apple Music
          </button>
        </div>
      </div>
      {locked && (
        <p className="mt-2 text-xs text-amber-300/90">
          Provider is locked by the MUSIC_PROVIDER environment variable on the
          server.
        </p>
      )}
      {!locked && adminMeta?.blockReason && (
        <p className="mt-2 text-xs text-amber-300/90">{adminMeta.blockReason}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-300">{error}</p>
      )}
    </div>
  );
}
