"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  LINE_DANCE_LEVELS,
  LINE_DANCE_LEVEL_LABELS,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";
import { GENRE_LABELS } from "@/lib/spotify/requestLimits";
import type { GenrePool } from "@/lib/spotify/playlistIds";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type SocialStatus = {
  isActive: boolean;
  name: string | null;
  playlistUrl: string | null;
  trackCount: number;
  availableGenres: GenrePool[];
};

type QuotaState = {
  limits: Partial<Record<GenrePool, number>> | null;
  used: Partial<Record<GenrePool, number>>;
  remaining: Partial<Record<GenrePool, number | null>>;
  availableGenres: GenrePool[];
};

type SearchTrack = {
  id: string;
  uri: string;
  name: string;
  primaryArtist: string;
  albumName: string | null;
  imageUrl: string | null;
  durationMs: number;
};

type Genre = GenrePool;

function formatRemaining(genre: Genre, quota: QuotaState | null): string {
  if (!quota) return "";
  const limit = quota.limits?.[genre];
  const remaining = quota.remaining[genre];
  if (limit == null || remaining == null) return `${GENRE_LABELS[genre]}: unlimited`;
  if (limit === 0) return `${GENRE_LABELS[genre]}: closed`;
  const used = quota.used[genre] ?? 0;
  return `${GENRE_LABELS[genre]}: ${Math.max(0, remaining)} of ${limit} remaining (${used} used)`;
}

function genreOptionDisabled(genre: Genre, quota: QuotaState | null): boolean {
  if (!quota) return false;
  const limit = quota.limits?.[genre];
  if (limit === 0) return true;
  const remaining = quota.remaining[genre];
  if (remaining != null && remaining <= 0) return true;
  return false;
}

function SocialAuthBar({
  isLoggedIn,
  displayName,
}: {
  isLoggedIn: boolean | null;
  displayName: string;
}) {
  return (
    <div className="flex justify-end mb-2 min-h-[2rem]">
      {isLoggedIn === null ? (
        <span className="text-xs text-gray-500">Checking sign-in…</span>
      ) : isLoggedIn ? (
        <span className="text-sm text-gray-400">
          Signed in{displayName ? ` as ${displayName}` : ""}
        </span>
      ) : (
        <Link
          href="/auth?next=/social"
          className="text-sm text-amber-400 underline hover:text-amber-300"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}

export default function SocialRequestPageClient() {
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaState | null>(null);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchTrack | null>(null);
  const [genre, setGenre] = useState<Genre | "">("");
  const [genreFromMaster, setGenreFromMaster] = useState(false);
  const [lookingUpGenre, setLookingUpGenre] = useState(false);
  const [lineDanceName, setLineDanceName] = useState("");
  const [lineDanceLevel, setLineDanceLevel] = useState<LineDanceLevel | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const genreOptions = (status?.availableGenres?.length
    ? status.availableGenres
    : (["cs", "wcs", "ld"] as Genre[])
  ).map((value) => ({ value, label: GENRE_LABELS[value] }));

  const loadQuota = useCallback(async (token: string | null) => {
    await fetch("/api/social/session");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/social/quota", { headers });
    if (!res.ok) return;
    const data = (await res.json()) as QuotaState;
    setQuota(data);
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch("/api/social/status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to load status"
        );
      }
      setStatus(data as SocialStatus);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to load");
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (session?.access_token) {
        setIsLoggedIn(true);
        setAccessToken(session.access_token);
        try {
          const meRes = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            const first = me.profile?.first_name?.trim();
            setDisplayName(first || "");
          }
        } catch {
          // optional display name
        }
      } else {
        setIsLoggedIn(false);
        setAccessToken(null);
        setDisplayName("");
      }
    };
    initAuth();

    const { data: listener } = supabaseBrowser.auth.onAuthStateChange(
      (_: AuthChangeEvent, session: Session | null) => {
        if (session?.access_token) {
          setIsLoggedIn(true);
          setAccessToken(session.access_token);
        } else {
          setIsLoggedIn(false);
          setAccessToken(null);
          setDisplayName("");
        }
        setTurnstileToken(null);
        turnstileRef.current?.reset();
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!status?.isActive) return;
    loadQuota(accessToken);
  }, [status?.isActive, accessToken, loadQuota]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!status?.isActive) return;
    if (selected) return;

    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/social/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        setSuggestions((data as { tracks?: SearchTrack[] }).tracks ?? []);
        setListOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected, status?.isActive]);

  const selectTrack = async (track: SearchTrack) => {
    setSelected(track);
    setQuery(`${track.name} — ${track.primaryArtist}`);
    setSuggestions([]);
    setListOpen(false);
    setFormError(null);
    setSuccess(null);
    setLookingUpGenre(true);
    setGenre("");
    setGenreFromMaster(false);
    try {
      const res = await fetch("/api/social/lookup-genre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as { genre?: Genre | null }).genre) {
        const g = (data as { genre: Genre }).genre;
        if (!genreOptionDisabled(g, quota)) {
          setGenre(g);
          setGenreFromMaster(true);
        }
      } else {
        setGenre("");
        setGenreFromMaster(false);
      }
    } catch {
      setGenre("");
      setGenreFromMaster(false);
    } finally {
      setLookingUpGenre(false);
    }
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery("");
    setGenre("");
    setGenreFromMaster(false);
    setLineDanceName("");
    setLineDanceLevel("");
    setSuggestions([]);
    setFormError(null);
    setSuccess(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!selected) {
      setFormError("Pick a song from the Spotify suggestions.");
      return;
    }
    if (!genre) {
      setFormError("Choose a dance category.");
      return;
    }
    if (!isLoggedIn && !turnstileToken) {
      setFormError("Please complete the captcha verification.");
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (isLoggedIn && accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const body: Record<string, string | undefined> = {
        trackId: selected.id,
        uri: selected.uri,
        name: selected.name,
        primaryArtist: selected.primaryArtist,
        genre,
        lineDanceName:
          genre === "ld" && lineDanceName.trim()
            ? lineDanceName.trim()
            : undefined,
        lineDanceLevel:
          genre === "ld" && lineDanceLevel ? lineDanceLevel : undefined,
      };
      if (!isLoggedIn) {
        body.turnstileToken = turnstileToken ?? undefined;
      }

      const res = await fetch("/api/social/request", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        throw new Error(
          (data as { error?: string }).error ?? "Request failed"
        );
      }
      const result = data as {
        result: "replaced" | "appended";
        addedToMaster: boolean;
        trackName: string;
      };
      const placed =
        result.result === "appended"
          ? "added to the end of the playlist"
          : "queued into the next matching set";
      const masterNote = result.addedToMaster
        ? " It was also added to the master playlist."
        : "";
      setSelected(null);
      setQuery("");
      setGenre("");
      setGenreFromMaster(false);
      setLineDanceName("");
      setLineDanceLevel("");
      setSuggestions([]);
      setFormError(null);
      setSuccess(`“${result.trackName}” ${placed}.${masterNote}`);
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      await loadQuota(accessToken);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const authBar = (
    <SocialAuthBar isLoggedIn={isLoggedIn} displayName={displayName} />
  );

  if (statusLoading) {
    return (
      <section className="max-w-xl mx-auto py-16">
        {authBar}
        <p className="text-center text-gray-400">Loading…</p>
      </section>
    );
  }

  if (statusError) {
    return (
      <section className="max-w-xl mx-auto py-16 space-y-3">
        {authBar}
        <h1 className="gold-wave text-4xl font-extrabold pb-2 text-center">
          Song Requests
        </h1>
        <p className="text-red-400 text-center">{statusError}</p>
      </section>
    );
  }

  if (!status?.isActive) {
    return (
      <section className="max-w-xl mx-auto py-16 space-y-4">
        {authBar}
        <h1 className="gold-wave text-4xl font-extrabold pb-2 text-center">
          Song Requests
        </h1>
        <p className="text-gray-300 text-center">
          Song requests aren’t open right now. Check back during The Social.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-xl mx-auto py-10 space-y-8">
      {authBar}
      <header className="text-center space-y-2">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Song Requests</h1>
        <p className="text-gray-300 text-sm">
          Request a song for{" "}
          <span className="text-amber-200">
            {status.name || "tonight’s Social"}
          </span>
          .
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-lg border border-neutral-700 bg-neutral-800/40 p-6"
      >
        <div ref={wrapRef} className="relative space-y-1">
          <label htmlFor="song-search" className="text-sm text-gray-400">
            Search Spotify
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="song-search"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setGenre("");
                setGenreFromMaster(false);
                setSuccess(null);
                setFormError(null);
                setListOpen(true);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setListOpen(true);
              }}
              placeholder="Start typing a song or artist…"
              autoComplete="off"
              disabled={submitting}
              className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2.5 text-sm"
            />
            {selected && (
              <button
                type="button"
                onClick={clearSelection}
                className="shrink-0 px-3 rounded border border-neutral-600 text-sm text-gray-300 hover:border-amber-600/50"
                disabled={submitting}
              >
                Clear
              </button>
            )}
          </div>
          {searching && (
            <p className="text-xs text-gray-500 pt-1">Searching…</p>
          )}
          {listOpen && !selected && suggestions.length > 0 && (
            <ul
              className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded border border-neutral-600 bg-neutral-900 shadow-lg"
              role="listbox"
            >
              {suggestions.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-800"
                    onClick={() => selectTrack(t)}
                  >
                    {t.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <span className="h-10 w-10 rounded bg-neutral-700 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-100 truncate">
                        {t.name}
                      </span>
                      <span className="block text-xs text-gray-400 truncate">
                        {t.primaryArtist}
                        {t.albumName ? ` · ${t.albumName}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-gray-400">Category</span>
          <select
            value={genre}
            onChange={(e) => {
              const next = e.target.value as Genre | "";
              setGenre(next);
              if (next !== "ld") {
                setLineDanceName("");
                setLineDanceLevel("");
              }
            }}
            disabled={submitting || lookingUpGenre || !selected}
            className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2.5 text-sm"
          >
            <option value="">
              {lookingUpGenre
                ? "Checking master playlists…"
                : "Select dance category…"}
            </option>
            {genreOptions.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={genreOptionDisabled(opt.value, quota)}
              >
                {opt.label}
                {genreOptionDisabled(opt.value, quota) ? " (limit reached)" : ""}
              </option>
            ))}
          </select>
          {quota && (
            <ul className="text-xs text-gray-500 pt-1 space-y-0.5">
              {genreOptions.map((opt) => (
                <li key={opt.value}>{formatRemaining(opt.value, quota)}</li>
              ))}
            </ul>
          )}
          {genreFromMaster && genre && (
            <span className="text-xs text-green-400">
              Found in the {GENRE_LABELS[genre]} master playlist.
            </span>
          )}
          {selected && !lookingUpGenre && !genreFromMaster && (
            <span className="text-xs text-amber-300/90">
              Not in a master playlist yet — pick a category so we can add it.
            </span>
          )}
        </label>

        {genre === "ld" && (
          <div className="space-y-3 rounded border border-neutral-700/80 bg-neutral-900/40 p-3">
            <p className="text-xs text-gray-500">
              Optional — help us match the line dance if you know it. Your
              answers are provisional until an admin confirms.
            </p>
            <label className="block space-y-1">
              <span className="text-sm text-gray-400">Line dance name</span>
              <input
                type="text"
                value={lineDanceName}
                onChange={(e) => setLineDanceName(e.target.value)}
                placeholder="e.g. Watermelon Crawl"
                disabled={submitting}
                className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-400">Difficulty</span>
              <select
                value={lineDanceLevel}
                onChange={(e) =>
                  setLineDanceLevel(e.target.value as LineDanceLevel | "")
                }
                disabled={submitting}
                className="w-full rounded bg-neutral-900 border border-neutral-600 px-3 py-2.5 text-sm"
              >
                <option value="">Unknown / skip</option>
                {LINE_DANCE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {LINE_DANCE_LEVEL_LABELS[lvl]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {isLoggedIn === false && siteKey && (
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
          </div>
        )}

        {formError && (
          <p className="text-sm text-red-400" role="alert">
            {formError}
          </p>
        )}
        {success && (
          <p className="text-sm text-green-400" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            !selected ||
            !genre ||
            lookingUpGenre ||
            isLoggedIn === null ||
            (isLoggedIn === false && !turnstileToken)
          }
          className="w-full px-4 py-2.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? "Submitting…" : "Request song"}
        </button>
      </form>
    </section>
  );
}
