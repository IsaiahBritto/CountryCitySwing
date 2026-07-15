"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  LINE_DANCE_LEVELS,
  LINE_DANCE_LEVEL_LABELS,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";

type UnassociatedRow = {
  spotify_track_id: string;
  track_name: string | null;
  primary_artist: string | null;
  line_dance_name: string | null;
  level: LineDanceLevel | null;
  match_source: string;
  needs_recheck: boolean;
};

export default function LineDancesPageClient() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [rows, setRows] = useState<UnassociatedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [manual, setManual] = useState<
    Record<string, { name: string; level: LineDanceLevel | "" }>
  >({});

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

  const loadRows = useCallback(async (token: string) => {
    const res = await fetch("/api/spotify/line-dance-meta?limit=200&offset=0", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? "Failed to load tracks"
      );
    }
    const list = ((data as { rows?: UnassociatedRow[] }).rows ??
      []) as UnassociatedRow[];
    setRows(list);
    setTotal((data as { total?: number }).total ?? list.length);
    setManual((prev) => {
      const next = { ...prev };
      for (const row of list) {
        if (!next[row.spotify_track_id]) {
          next[row.spotify_track_id] = {
            name: row.line_dance_name ?? "",
            level: row.level ?? "",
          };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.user) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        const meRes = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!meRes.ok) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        const me = await meRes.json();
        const admin = (me.profile?.role || "").toLowerCase() === "admin";
        setIsAdmin(admin);
        if (!admin) {
          setLoading(false);
          return;
        }
        setAuthToken(session.access_token);
        await loadRows(session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadRows]);

  const confirm = async (input: {
    trackId: string;
    lineDanceName: string;
    level: LineDanceLevel;
    trackName?: string | null;
    primaryArtist?: string | null;
  }) => {
    setError(null);
    setSavingId(input.trackId);
    try {
      const token = authToken ?? (await getFreshAdminToken());
      const res = await fetch("/api/spotify/line-dance-meta/confirm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to save"
        );
      }
      await loadRows(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <section className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-400">Loading Line Dance master playlist…</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="max-w-xl mx-auto text-center space-y-4 py-16">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Line Dances</h1>
        <p className="text-gray-300">
          Admin access required.{" "}
          <Link href="/auth" className="text-amber-400 underline">
            Sign in
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto py-10 space-y-8">
      <header className="space-y-2">
        <p className="text-sm text-gray-500">
          <Link href="/spotify" className="text-amber-400 underline">
            ← Spotify Social
          </Link>
        </p>
        <h1 className="gold-wave text-4xl font-extrabold pb-2">
          Line Dance Associations
        </h1>
        <p className="text-sm text-gray-400">
          Songs from the Line Dance master playlist that still need a dance
          name and difficulty ({total} remaining). Admin saves are treated as
          fact.
        </p>
      </header>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">
          All Line Dance master songs have a confirmed association.
        </p>
      ) : (
        <ul className="space-y-6">
          {rows.map((row) => {
            const draft = manual[row.spotify_track_id] ?? {
              name: "",
              level: "" as const,
            };
            const busy = savingId === row.spotify_track_id;
            return (
              <li
                key={row.spotify_track_id}
                className="border border-neutral-700 rounded-lg p-4 space-y-4 bg-neutral-800/30"
              >
                <div>
                  <p className="text-gray-100 font-medium">
                    {row.track_name || "Unknown track"}
                  </p>
                  <p className="text-sm text-gray-400">
                    {row.primary_artist || "Unknown artist"}
                  </p>
                  {(row.line_dance_name || row.level) && (
                    <p className="text-xs text-amber-300/90 mt-1">
                      Provisional ({row.match_source}):{" "}
                      {row.line_dance_name || "—"} / {row.level || "—"}
                    </p>
                  )}
                </div>

                <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">
                      Line dance name
                    </span>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) =>
                        setManual((prev) => ({
                          ...prev,
                          [row.spotify_track_id]: {
                            ...draft,
                            name: e.target.value,
                          },
                        }))
                      }
                      disabled={busy}
                      className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm"
                      placeholder="e.g. Watermelon Crawl"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">Level</span>
                    <select
                      value={draft.level}
                      onChange={(e) =>
                        setManual((prev) => ({
                          ...prev,
                          [row.spotify_track_id]: {
                            ...draft,
                            level: e.target.value as LineDanceLevel | "",
                          },
                        }))
                      }
                      disabled={busy}
                      className="rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm"
                    >
                      <option value="">Select…</option>
                      {LINE_DANCE_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {LINE_DANCE_LEVEL_LABELS[lvl]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !draft.name.trim() || !draft.level}
                    onClick={() =>
                      confirm({
                        trackId: row.spotify_track_id,
                        lineDanceName: draft.name,
                        level: draft.level as LineDanceLevel,
                        trackName: row.track_name,
                        primaryArtist: row.primary_artist,
                      })
                    }
                    className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
                  >
                    {busy ? "Saving…" : "Save as fact"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
