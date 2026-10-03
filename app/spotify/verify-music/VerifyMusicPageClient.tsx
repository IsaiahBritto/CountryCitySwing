"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import type { VerifyDance, VerifyTrackRow } from "@/lib/spotify/verifyMusic";

const DANCE_OPTIONS: { id: VerifyDance; label: string }[] = [
  { id: "country_swing", label: "Country Swing" },
  { id: "two_step", label: "Two Step" },
  { id: "waltz", label: "Waltz" },
];

function isNonFourFourTimeSignature(timeSignature: string | null): boolean {
  if (!timeSignature?.trim()) return false;
  return timeSignature.trim() !== "4/4";
}

export default function VerifyMusicPageClient() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [tracks, setTracks] = useState<VerifyTrackRow[]>([]);
  const [danceByTrackId, setDanceByTrackId] = useState<
    Record<string, VerifyDance>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    addedTwoStep: number;
    addedWaltz: number;
    removedFromCountrySwing: number;
  } | null>(null);

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

  const loadTracks = useCallback(async (token: string) => {
    const res = await fetch("/api/spotify/verify-music", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? "Failed to load tracks"
      );
    }
    const list = ((data as { tracks?: VerifyTrackRow[] }).tracks ??
      []) as VerifyTrackRow[];
    setTracks(list);
    setDanceByTrackId((prev) => {
      const next: Record<string, VerifyDance> = {};
      for (const row of list) {
        next[row.trackId] = prev[row.trackId] ?? "country_swing";
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
        await loadTracks(session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadTracks]);

  const save = async () => {
    setError(null);
    setSaveResult(null);
    setSaving(true);
    try {
      const token = authToken ?? (await getFreshAdminToken());
      const items = tracks.map((row) => ({
        trackId: row.trackId,
        uri: row.uri,
        dance: danceByTrackId[row.trackId] ?? "country_swing",
      }));
      const res = await fetch("/api/spotify/verify-music/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to save"
        );
      }
      setSaveResult(data as typeof saveResult);
      await loadTracks(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="max-w-4xl mx-auto text-center py-16">
        <p className="text-gray-400">Loading Country Swing playlist…</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="max-w-xl mx-auto text-center space-y-4 py-16">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Verify Music</h1>
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
    <section className="max-w-4xl mx-auto py-10 space-y-6 pb-28">
      <header className="space-y-2">
        <p className="text-sm text-gray-500">
          <Link href="/spotify" className="text-amber-400 underline">
            ← Spotify Social
          </Link>
        </p>
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Verify Music</h1>
        <p className="text-sm text-gray-400">
          Classify each song on the Country Swing master playlist. Run{" "}
          <strong className="text-gray-300 font-normal">Sync</strong> on Country
          Swing first for BPM and time signature. On save, Two Step and Waltz
          selections move to their master playlists and are removed from Country
          Swing.
        </p>
      </header>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {saveResult && (
        <p className="text-sm text-green-400/90">
          Saved: added {saveResult.addedTwoStep} to Two Step,{" "}
          {saveResult.addedWaltz} to Waltz; removed{" "}
          {saveResult.removedFromCountrySwing} from Country Swing.
        </p>
      )}

      {tracks.length === 0 ? (
        <p className="text-gray-400 text-sm">No tracks on Country Swing.</p>
      ) : (
        <ul className="space-y-3">
          {tracks.map((row) => {
            const dance = danceByTrackId[row.trackId] ?? "country_swing";
            const highlightTimeSig = isNonFourFourTimeSignature(
              row.timeSignature
            );
            return (
              <li
                key={row.trackId}
                className={`border rounded-lg px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
                  highlightTimeSig
                    ? "border-amber-500/70 bg-amber-950/25 ring-1 ring-amber-500/30"
                    : "border-neutral-700 bg-neutral-800/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-gray-100 font-medium truncate">
                    {row.name}
                  </p>
                  <p className="text-sm text-gray-400 truncate">
                    {row.primaryArtist}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    BPM: {row.bpm ?? "—"} · Time:{" "}
                    {highlightTimeSig ? (
                      <span className="text-amber-300 font-medium">
                        {row.timeSignature}
                      </span>
                    ) : (
                      <span>{row.timeSignature ?? "—"}</span>
                    )}
                    {row.analysisStatus === "missing" && (
                      <span className="text-amber-500/80"> · sync recommended</span>
                    )}
                  </p>
                </div>
                <div
                  className="flex flex-wrap gap-1 shrink-0"
                  role="radiogroup"
                  aria-label={`Classification for ${row.name}`}
                >
                  {DANCE_OPTIONS.map((opt) => {
                    const selected = dance === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={saving}
                        onClick={() =>
                          setDanceByTrackId((prev) => ({
                            ...prev,
                            [row.trackId]: opt.id,
                          }))
                        }
                        className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${
                          selected
                            ? "border-amber-500 bg-amber-900/40 text-amber-100"
                            : "border-neutral-600 text-gray-400 hover:border-neutral-500"
                        } disabled:opacity-50`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur px-4 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">{tracks.length} tracks</p>
          <button
            type="button"
            onClick={save}
            disabled={saving || tracks.length === 0}
            className="px-5 py-2.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? "Saving…" : "Save classifications"}
          </button>
        </div>
      </div>
    </section>
  );
}
