"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProfileSearchPicker, {
  type ProfileResult,
} from "@/components/ProfileSearchPicker";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { profileDisplayName } from "@/lib/profileUtils";
import {
  LINE_DANCE_LEVELS,
  LINE_DANCE_LEVEL_LABELS,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";
import {
  filterReviewRows,
  lineDanceCompletionStatus,
  type LineDanceReviewFilter,
} from "@/lib/spotify/lineDanceMetaLogic";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ReviewRow = {
  spotify_track_id: string;
  track_name: string | null;
  primary_artist: string | null;
  line_dance_name: string | null;
  level: LineDanceLevel | null;
  match_source: string;
  needs_recheck: boolean;
};

type ReviewerEntry = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

const PAGE_SIZE = 100;
const REVIEW_PATH = "/spotify/line-dances/review";

function statusLabel(row: ReviewRow): string {
  if (row.match_source === "admin") return "Admin confirmed";
  const status = lineDanceCompletionStatus(row);
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  return "Empty";
}

function statusClass(row: ReviewRow): string {
  if (row.match_source === "admin") return "text-emerald-300 bg-emerald-950/50";
  const status = lineDanceCompletionStatus(row);
  if (status === "complete") return "text-emerald-300 bg-emerald-950/40";
  if (status === "partial") return "text-amber-300 bg-amber-950/40";
  return "text-gray-400 bg-neutral-800/80";
}

function rowFromMeta(meta: ReviewRow): ReviewRow {
  return {
    spotify_track_id: meta.spotify_track_id,
    track_name: meta.track_name,
    primary_artist: meta.primary_artist,
    line_dance_name: meta.line_dance_name,
    level: meta.level,
    match_source: meta.match_source,
    needs_recheck: meta.needs_recheck,
  };
}

export default function LineDanceReviewPageClient() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<ReviewRow[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<LineDanceReviewFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; level: LineDanceLevel | "" }>
  >({});
  const [reviewers, setReviewers] = useState<ReviewerEntry[]>([]);
  const [pickerProfile, setPickerProfile] = useState<ProfileResult | null>(
    null
  );
  const [assignBusy, setAssignBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const filteredRows = useMemo(
    () => filterReviewRows(allRows, filter),
    [allRows, filter]
  );

  const visibleRows = useMemo(
    () => filteredRows.slice(offset, offset + PAGE_SIZE),
    [filteredRows, offset]
  );

  const total = filteredRows.length;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  useEffect(() => {
    if (total > 0 && offset >= total) {
      setOffset(0);
    }
  }, [offset, total]);

  const getFreshToken = useCallback(async (): Promise<string> => {
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

  const loadReviewers = useCallback(async () => {
    const res = await authedFetch("/api/spotify/line-dance-reviewers");
    if (!res.ok) return;
    const data = await res.json();
    setReviewers(data.reviewers ?? []);
  }, []);

  const fetchAllRows = useCallback(
    async (token: string, sync: boolean): Promise<boolean> => {
      const params = sync ? "?sync=1" : "";
      const res = await fetch(`/api/spotify/line-dance-meta/review${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to load tracks"
        );
      }
      const list = ((data as { rows?: ReviewRow[] }).rows ?? []) as ReviewRow[];
      const needsSync = (data as { needsSync?: boolean }).needsSync === true;
      setAllRows(list);
      setSyncedAt((data as { syncedAt?: string | null }).syncedAt ?? null);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of list) {
          next[row.spotify_track_id] = {
            name: row.line_dance_name ?? "",
            level: row.level ?? "",
          };
        }
        return next;
      });
      return needsSync;
    },
    []
  );

  const loadPlaylist = useCallback(
    async (token: string, options?: { sync?: boolean; isRefresh?: boolean }) => {
      const sync = options?.sync ?? false;
      if (options?.isRefresh) {
        setSyncing(true);
      } else {
        setInitialLoading(true);
      }
      setError(null);
      try {
        const needsSync = await fetchAllRows(token, sync);
        if (needsSync && !sync) {
          await fetchAllRows(token, true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setInitialLoading(false);
        setSyncing(false);
      }
    },
    [fetchAllRows]
  );

  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.user) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);

        const meRes = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const admin =
          meRes.ok &&
          ((await meRes.json()).profile?.role || "").toLowerCase() === "admin";
        setIsAdmin(admin);

        const probe = await fetch("/api/spotify/line-dance-meta/review", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!probe.ok && !admin) {
          setCanReview(false);
          return;
        }

        setCanReview(true);
        setAuthToken(session.access_token);
        if (admin) await loadReviewers();
        await loadPlaylist(session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setInitialLoading(false);
      }
    };
    init();
  }, [loadPlaylist, loadReviewers]);

  const refreshFromSpotify = async () => {
    try {
      const token = authToken ?? (await getFreshToken());
      await loadPlaylist(token, { sync: true, isRefresh: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    }
  };

  const saveRow = async (row: ReviewRow) => {
    const draft = drafts[row.spotify_track_id] ?? { name: "", level: "" };
    const name = draft.name.trim();
    const level = draft.level;
    if (!name && !level) return;

    setError(null);
    setSavingId(row.spotify_track_id);
    try {
      const token = authToken ?? (await getFreshToken());
      const body: Record<string, string> = { trackId: row.spotify_track_id };
      if (name) body.lineDanceName = name;
      if (level) body.level = level;
      if (row.track_name) body.trackName = row.track_name;
      if (row.primary_artist) body.primaryArtist = row.primary_artist;

      const res = await fetch("/api/spotify/line-dance-meta/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to save"
        );
      }

      const meta = (data as { meta?: ReviewRow }).meta;
      if (meta) {
        const updated = rowFromMeta(meta);
        setAllRows((prev) =>
          prev.map((r) =>
            r.spotify_track_id === updated.spotify_track_id ? updated : r
          )
        );
        setDrafts((prev) => ({
          ...prev,
          [updated.spotify_track_id]: {
            name: updated.line_dance_name ?? "",
            level: updated.level ?? "",
          },
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const assignReviewer = async () => {
    if (!pickerProfile) return;
    setAssignBusy(true);
    setError(null);
    const res = await authedFetch("/api/spotify/line-dance-reviewers", {
      method: "POST",
      body: JSON.stringify({ profile_id: pickerProfile.id }),
    });
    setAssignBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setReviewers(data.reviewers ?? []);
    setPickerProfile(null);
  };

  const removeReviewer = async (profileId: string) => {
    setAssignBusy(true);
    setError(null);
    const res = await authedFetch(
      `/api/spotify/line-dance-reviewers?profile_id=${profileId}`,
      { method: "DELETE" }
    );
    setAssignBusy(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setReviewers(data.reviewers ?? []);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${REVIEW_PATH}`);
      setCopyMsg("Link copied!");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Could not copy link");
    }
  };

  if (initialLoading && allRows.length === 0 && !error) {
    return (
      <section className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-400">Loading Line Dance playlist…</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="max-w-xl mx-auto text-center space-y-4 py-16">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">
          Line Dance Review
        </h1>
        <p className="text-gray-300">
          Sign in with your CCS account to classify line dance songs.{" "}
          <Link
            href={`/auth?next=${encodeURIComponent(REVIEW_PATH)}`}
            className="text-amber-400 underline"
          >
            Sign in
          </Link>
          .
        </p>
      </section>
    );
  }

  if (!canReview) {
    return (
      <section className="max-w-xl mx-auto text-center space-y-4 py-16">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">
          Line Dance Review
        </h1>
        <p className="text-gray-300">
          You don&apos;t have access to this page. Ask an admin to assign you as
          a line dance reviewer.
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="gold-wave text-4xl font-extrabold pb-2">
              Line Dance Review
            </h1>
            <p className="text-sm text-gray-400">
              Classify songs from the Line Dance master playlist with a dance
              name and difficulty level. You can save either field independently.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshFromSpotify}
            disabled={syncing}
            className="text-sm px-3 py-1.5 rounded border border-neutral-600 hover:bg-neutral-800 disabled:opacity-50 shrink-0"
          >
            {syncing ? "Syncing…" : "Refresh from Spotify"}
          </button>
        </div>
        {syncedAt && (
          <p className="text-xs text-gray-500">
            Playlist synced{" "}
            {new Date(syncedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </header>

      {isAdmin && (
        <div className="border border-neutral-700 rounded-lg p-4 space-y-4 bg-neutral-800/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-amber-200">Reviewers</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="text-sm px-3 py-1.5 rounded border border-neutral-600 hover:bg-neutral-800"
              >
                Copy review link
              </button>
              {copyMsg && (
                <span className="text-xs text-emerald-400">{copyMsg}</span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Assign a CCS account holder, then send them{" "}
            <code className="text-amber-300/90">{REVIEW_PATH}</code>.
          </p>

          <ProfileSearchPicker
            label="Add reviewer"
            value={pickerProfile}
            onChange={setPickerProfile}
            searchUrl="/api/spotify/line-dance-reviewers"
            disabled={assignBusy}
          />
          {pickerProfile && (
            <button
              type="button"
              disabled={assignBusy}
              onClick={assignReviewer}
              className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
            >
              Assign reviewer
            </button>
          )}

          {reviewers.length > 0 && (
            <ul className="space-y-2">
              {reviewers.map((r) => (
                <li
                  key={r.profile_id}
                  className="flex items-center justify-between gap-3 text-sm border border-neutral-700 rounded px-3 py-2"
                >
                  <span className="text-gray-200">
                    {profileDisplayName(r)}
                    {r.email ? (
                      <span className="text-gray-500 ml-2">{r.email}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    disabled={assignBusy}
                    onClick={() => removeReviewer(r.profile_id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "empty", "partial", "complete"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setOffset(0);
              setFilter(f);
            }}
            className={`px-3 py-1.5 rounded text-sm capitalize ${
              filter === f
                ? "bg-amber-600 text-white"
                : "border border-neutral-600 text-gray-300 hover:bg-neutral-800"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-auto">
          {total} song{total === 1 ? "" : "s"}
          {total > 0 ? ` · showing ${pageStart}–${pageEnd}` : ""}
        </span>
      </div>

      {visibleRows.length === 0 ? (
        <p className="text-gray-400 text-sm">No songs match this filter.</p>
      ) : (
        <ul className="space-y-6">
          {visibleRows.map((row) => {
            const draft = drafts[row.spotify_track_id] ?? {
              name: "",
              level: "" as const,
            };
            const locked = row.match_source === "admin";
            const busy = savingId === row.spotify_track_id;
            const canSave =
              !locked && !busy && (!!draft.name.trim() || !!draft.level);

            return (
              <li
                key={row.spotify_track_id}
                className="border border-neutral-700 rounded-lg p-4 space-y-4 bg-neutral-800/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-gray-100 font-medium">
                      {row.track_name || "Unknown track"}
                    </p>
                    <p className="text-sm text-gray-400">
                      {row.primary_artist || "Unknown artist"}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${statusClass(row)}`}
                  >
                    {statusLabel(row)}
                  </span>
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
                        setDrafts((prev) => ({
                          ...prev,
                          [row.spotify_track_id]: {
                            ...draft,
                            name: e.target.value,
                          },
                        }))
                      }
                      disabled={busy || locked}
                      readOnly={locked}
                      className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm disabled:opacity-60"
                      placeholder="e.g. Watermelon Crawl"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">Level</span>
                    <select
                      value={draft.level}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.spotify_track_id]: {
                            ...draft,
                            level: e.target.value as LineDanceLevel | "",
                          },
                        }))
                      }
                      disabled={busy || locked}
                      className="rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <option value="">Select…</option>
                      {LINE_DANCE_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {LINE_DANCE_LEVEL_LABELS[lvl]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!locked && (
                    <button
                      type="button"
                      disabled={!canSave}
                      onClick={() => saveRow(row)}
                      className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="px-3 py-2 rounded border border-neutral-600 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="px-3 py-2 rounded border border-neutral-600 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
