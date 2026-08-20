"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type MasterInfo = {
  linkId: string;
  label: string;
  spotifyPlaylistId: string;
  genre: string;
};

type SyncResult = {
  scanned: number;
  lookedUp: number;
  stillUnknown: number;
  playlists?: Array<{
    playlistId: string;
    label: string | null;
    scanned: number;
    lookedUp: number;
    stillUnknown: number;
  }>;
};

type GenerateResult = {
  id: string;
  url: string;
  durationMs: number;
  trackCount: number;
  lookedUp: number;
  stillUnknown: number;
};

type ActivePlaylistStatus = {
  isActive: boolean;
  spotifyPlaylistId: string | null;
  playlistUrl: string | null;
  name: string | null;
  activatedAt: string | null;
  trackCount: number;
};

type OwnedPlaylist = {
  id: string;
  name: string;
  url: string;
  trackCount: number | null;
  public: boolean | null;
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

export default function SpotifyPageClient() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [masters, setMasters] = useState<MasterInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [lookupFeatures, setLookupFeatures] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(
    null
  );
  const [activePlaylist, setActivePlaylist] =
    useState<ActivePlaylistStatus | null>(null);
  const [ownedPlaylists, setOwnedPlaylists] = useState<OwnedPlaylist[]>([]);
  const [selectedOwnedId, setSelectedOwnedId] = useState("");
  const [loadingOwned, setLoadingOwned] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const loadActivePlaylist = useCallback(async (token: string) => {
    const res = await fetch("/api/spotify/active-playlist", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? "Failed to load active playlist"
      );
    }
    const data = (await res.json()) as ActivePlaylistStatus;
    setActivePlaylist(data);
  }, []);

  const loadOwnedPlaylists = useCallback(async (token: string) => {
    setLoadingOwned(true);
    try {
      const res = await fetch("/api/spotify/playlists", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (body as { error?: string }).error ?? "Failed to list owned playlists"
        );
      }
      const list = ((body as { playlists?: OwnedPlaylist[] }).playlists ??
        []) as OwnedPlaylist[];
      setOwnedPlaylists(list);
      setSelectedOwnedId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    } finally {
      setLoadingOwned(false);
    }
  }, []);

  const loadStatus = useCallback(
    async (token: string) => {
      const res = await fetch("/api/spotify/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to load Spotify status"
        );
      }
      const data = await res.json();
      setConnected(Boolean(data.connected));
      setMasters((data.masters as MasterInfo[]) ?? []);
      await loadActivePlaylist(token);
      if (data.connected) {
        try {
          await loadOwnedPlaylists(token);
        } catch (err) {
          console.error(err);
          setOwnedPlaylists([]);
        }
      } else {
        setOwnedPlaylists([]);
        setSelectedOwnedId("");
      }
    },
    [loadActivePlaylist, loadOwnedPlaylists]
  );

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(`Spotify connection failed: ${oauthError}`);
    }
  }, [searchParams]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.user) {
        setIsAdmin(false);
        setAuthToken(null);
        setLoading(false);
        return;
      }
      const meRes = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!meRes.ok) {
        setIsAdmin(false);
        setAuthToken(null);
        setLoading(false);
        return;
      }
      const me = await meRes.json();
      const roleLower = (me.profile?.role || "").toLowerCase();
      const admin = roleLower === "admin";
      setIsAdmin(admin);
      if (!admin) {
        setAuthToken(null);
        setLoading(false);
        return;
      }
      setAuthToken(session.access_token);
      try {
        await loadStatus(session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load status");
      }
      setLoading(false);
    };
    init();
  }, [loadStatus]);

  const getFreshAdminToken = useCallback(async (): Promise<string> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabaseBrowser.auth.getSession();
    if (sessionError || !session?.access_token) {
      setAuthToken(null);
      throw new Error("Session expired. Please sign in again.");
    }
    setAuthToken(session.access_token);
    return session.access_token;
  }, []);

  const connectSpotify = async () => {
    setConnecting(true);
    setError(null);
    try {
      const token = await getFreshAdminToken();
      const res = await fetch("/api/spotify/auth", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to start Spotify auth"
        );
      }
      const url = (data as { url?: string }).url;
      if (!url) throw new Error("Missing Spotify authorize URL");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Spotify");
      setConnecting(false);
    }
  };

  const runSync = async (playlistId?: string) => {
    setError(null);
    setSyncResult(null);
    if (playlistId) setSyncingId(playlistId);
    else setSyncingAll(true);
    try {
      const token = await getFreshAdminToken();
      const res = await fetch("/api/spotify/sync-features", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(playlistId ? { playlistId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to sync features"
        );
      }
      setSyncResult(data as SyncResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync features");
    } finally {
      setSyncingId(null);
      setSyncingAll(false);
    }
  };

  const runGenerate = async () => {
    setError(null);
    setGenerateResult(null);
    setGenerating(true);
    try {
      const token = await getFreshAdminToken();
      const res = await fetch("/api/spotify/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: playlistName,
          lookupFeatures,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to generate playlist"
        );
      }
      setGenerateResult(data as GenerateResult);
      setSelectedOwnedId((data as GenerateResult).id);
      try {
        await loadOwnedPlaylists(token);
        setSelectedOwnedId((data as GenerateResult).id);
      } catch {
        // list refresh is best-effort; selection still set to new id
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate playlist"
      );
    } finally {
      setGenerating(false);
    }
  };

  const runActivate = async (playlistIdOrUrl: string) => {
    setError(null);
    setActivating(true);
    try {
      const token = await getFreshAdminToken();
      const res = await fetch("/api/spotify/active-playlist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "activate",
          playlistIdOrUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to activate playlist"
        );
      }
      setActivePlaylist(data as ActivePlaylistStatus);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to activate playlist"
      );
    } finally {
      setActivating(false);
    }
  };

  const runDeactivate = async () => {
    setError(null);
    setDeactivating(true);
    try {
      const token = await getFreshAdminToken();
      const res = await fetch("/api/spotify/active-playlist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "deactivate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to deactivate"
        );
      }
      setActivePlaylist(data as ActivePlaylistStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate");
    } finally {
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <section className="max-w-xl mx-auto text-center">
        <p className="text-gray-400">Loading…</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="max-w-xl mx-auto text-center space-y-4">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Spotify Social</h1>
        <p className="text-gray-300">
          Admin access required.{" "}
          <Link href="/auth" className="text-amber-400 underline">
            Sign in
          </Link>{" "}
          with an admin account.
        </p>
      </section>
    );
  }

  const busy =
    syncingAll ||
    Boolean(syncingId) ||
    generating ||
    connecting ||
    activating ||
    deactivating;

  return (
    <section className="max-w-2xl mx-auto space-y-10">
      <header className="text-center space-y-2">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Spotify Social</h1>
        <p className="text-gray-300 text-sm">
          Sync master playlist features, then generate a private ~5.5h Social mix
          (2 Country / 2 West Coast / 2 Line Dance).
        </p>
      </header>

      {error && (
        <p className="text-red-400 text-sm text-center" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-3 border border-neutral-700 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-amber-200">Spotify account</h2>
        {connected ? (
          <p className="text-sm text-gray-300">Connected. Ready to sync and generate.</p>
        ) : (
          <p className="text-sm text-gray-400">
            Connect the Spotify account that owns the master playlists.
          </p>
        )}
        <button
          type="button"
          onClick={connectSpotify}
          disabled={busy}
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
        >
          {connecting
            ? "Redirecting…"
            : connected
              ? "Reconnect Spotify"
              : "Connect Spotify"}
        </button>
      </div>

      {connected && (
        <>
          <div className="space-y-4 border border-neutral-700 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-amber-200">
                Sync features
              </h2>
              <button
                type="button"
                onClick={() => runSync()}
                disabled={busy || masters.length === 0}
                className="px-3 py-1.5 rounded border border-amber-600/60 text-amber-200 hover:bg-amber-900/30 disabled:opacity-50 text-sm"
              >
                {syncingAll ? "Syncing all…" : "Sync all"}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Pulls tracks from Spotify and fills BPM/energy cache via FreqBlog
              (only missing or incomplete rows). Run this before generate to save
              quota.
            </p>
            <ul className="space-y-2">
              {masters.map((m) => (
                <li
                  key={m.linkId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded bg-neutral-800/60 px-3 py-2"
                >
                  <span className="text-sm text-gray-200">{m.label}</span>
                  <button
                    type="button"
                    onClick={() => runSync(m.spotifyPlaylistId)}
                    disabled={busy}
                    className="px-3 py-1 rounded text-xs border border-neutral-600 hover:border-amber-600/50 disabled:opacity-50"
                  >
                    {syncingId === m.spotifyPlaylistId ? "Syncing…" : "Sync"}
                  </button>
                </li>
              ))}
            </ul>
            {syncResult && (
              <p className="text-sm text-gray-400">
                Last sync: scanned {syncResult.scanned}, looked up{" "}
                {syncResult.lookedUp}, still unknown {syncResult.stillUnknown}
              </p>
            )}
          </div>

          <div className="space-y-4 border border-neutral-700 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-amber-200">
                Line dance associations
              </h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/spotify/line-dances/review"
                  className="text-sm text-amber-400 underline"
                >
                  Reviewer assignment
                </Link>
                <Link
                  href="/spotify/line-dances"
                  className="text-sm text-amber-400 underline"
                >
                  Manage associations
                </Link>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Assign reviewers to classify Line Dance master songs, or confirm
              missing dance names and difficulty levels manually.
            </p>
          </div>

          <div className="space-y-4 border border-neutral-700 rounded-lg p-5">
            <h2 className="text-lg font-semibold text-amber-200">
              Generate Social
            </h2>
            <label className="block space-y-1">
              <span className="text-sm text-gray-400">Playlist name</span>
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="CCS Social — Jul 12"
                maxLength={100}
                className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm"
                disabled={busy}
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={lookupFeatures}
                onChange={(e) => setLookupFeatures(e.target.checked)}
                disabled={busy}
                className="mt-1"
              />
              <span>
                Lookup missing BPM/energy on FreqBlog
                <span className="block text-xs text-gray-500 mt-0.5">
                  Leave off to generate from the synced cache only (faster, no
                  FreqBlog quota). Sync first for best results. When on, only
                  tracks missing true BPM or energy are looked up.
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={runGenerate}
              disabled={busy || !playlistName.trim()}
              className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
            >
              {generating
                ? lookupFeatures
                  ? "Generating… (this can take a few minutes)"
                  : "Generating…"
                : "Generate playlist"}
            </button>
            {generateResult && (
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  Created {generateResult.trackCount} tracks (
                  {formatDuration(generateResult.durationMs)}). Gap-fill looked
                  up {generateResult.lookedUp}; still unknown{" "}
                  {generateResult.stillUnknown}.
                </p>
                <a
                  href={generateResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline"
                >
                  Open playlist in Spotify
                </a>
                <div>
                  <button
                    type="button"
                    onClick={() => runActivate(generateResult.url)}
                    disabled={busy}
                    className="mt-2 px-3 py-1.5 rounded border border-amber-600/60 text-amber-200 hover:bg-amber-900/30 disabled:opacity-50 text-sm"
                  >
                    {activating ? "Activating…" : "Activate for /social requests"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 border border-neutral-700 rounded-lg p-5">
            <h2 className="text-lg font-semibold text-amber-200">
              Active Social for requests
            </h2>
            <p className="text-xs text-gray-500">
              When active, anyone with the unlisted{" "}
              <Link href="/social" className="text-amber-400 underline">
                /social
              </Link>{" "}
              link can request songs into this playlist. Only playlists{" "}
              <span className="text-gray-300">owned</span> by the connected
              Spotify account are listed (those are editable for requests).
              After adding playback scopes, reconnect Spotify once.
            </p>
            {activePlaylist?.isActive ? (
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  <span className="text-green-400">Active:</span>{" "}
                  {activePlaylist.name || "Untitled"} (
                  {activePlaylist.trackCount} tracks)
                </p>
                {activePlaylist.playlistUrl && (
                  <a
                    href={activePlaylist.playlistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 underline"
                  >
                    Open in Spotify
                  </a>
                )}
                <div>
                  <button
                    type="button"
                    onClick={runDeactivate}
                    disabled={busy}
                    className="px-3 py-1.5 rounded border border-red-700/60 text-red-300 hover:bg-red-950/40 disabled:opacity-50 text-sm"
                  >
                    {deactivating ? "Deactivating…" : "Deactivate requests"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No playlist is active for requests.</p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block space-y-1 flex-1 min-w-[14rem]">
                <span className="text-sm text-gray-400">
                  Your owned playlists
                </span>
                <select
                  value={selectedOwnedId}
                  onChange={(e) => setSelectedOwnedId(e.target.value)}
                  disabled={busy || loadingOwned || ownedPlaylists.length === 0}
                  className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm"
                >
                  {ownedPlaylists.length === 0 ? (
                    <option value="">
                      {loadingOwned
                        ? "Loading playlists…"
                        : "No owned playlists found"}
                    </option>
                  ) : (
                    ownedPlaylists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.trackCount != null ? ` (${p.trackCount})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = await getFreshAdminToken();
                    await loadOwnedPlaylists(token);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to refresh playlists"
                    );
                  }
                }}
                disabled={busy || loadingOwned}
                className="px-3 py-2 rounded border border-neutral-600 text-sm text-gray-300 hover:border-amber-600/50 disabled:opacity-50"
              >
                {loadingOwned ? "Refreshing…" : "Refresh list"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => runActivate(selectedOwnedId)}
              disabled={busy || !selectedOwnedId.trim()}
              className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
            >
              {activating ? "Activating…" : "Activate selected playlist"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
