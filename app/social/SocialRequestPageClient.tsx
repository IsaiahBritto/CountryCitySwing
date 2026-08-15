"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  LINE_DANCE_LEVELS,
  LINE_DANCE_LEVEL_LABELS,
  type LineDanceLevel,
} from "@/lib/spotify/lineDanceLevels";

type SocialStatus = {
  isActive: boolean;
  name: string | null;
  playlistUrl: string | null;
  trackCount: number;
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

type Genre = "cs" | "wcs" | "ld";

const GENRE_OPTIONS: { value: Genre; label: string }[] = [
  { value: "cs", label: "Country Swing" },
  { value: "wcs", label: "West Coast Swing" },
  { value: "ld", label: "Line Dance" },
];

export default function SocialRequestPageClient() {
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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
        setGenre(g);
        setGenreFromMaster(true);
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
      setFormError("Choose Country Swing, West Coast Swing, or Line Dance.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/social/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (statusLoading) {
    return (
      <section className="max-w-xl mx-auto text-center py-16">
        <p className="text-gray-400">Loading…</p>
      </section>
    );
  }

  if (statusError) {
    return (
      <section className="max-w-xl mx-auto text-center py-16 space-y-3">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Song Requests</h1>
        <p className="text-red-400">{statusError}</p>
      </section>
    );
  }

  if (!status?.isActive) {
    return (
      <section className="max-w-xl mx-auto text-center py-16 space-y-4">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Song Requests</h1>
        <p className="text-gray-300">
          Song requests aren’t open right now. Check back during The Social.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-xl mx-auto py-10 space-y-8">
      <header className="text-center space-y-2">
        <h1 className="gold-wave text-4xl font-extrabold pb-2">Song Requests</h1>
        <p className="text-gray-300 text-sm">
          Request a song for{" "}
          <span className="text-amber-200">
            {status.name || "tonight’s Social"}
          </span>
          . We’ll keep the 2 Country / 2 West Coast / 2 Line Dance flow.
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
            {GENRE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {genreFromMaster && genre && (
            <span className="text-xs text-green-400">
              Found in the{" "}
              {GENRE_OPTIONS.find((o) => o.value === genre)?.label} master
              playlist.
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
          disabled={submitting || !selected || !genre || lookingUpGenre}
          className="w-full px-4 py-2.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? "Submitting…" : "Request song"}
        </button>
      </form>
    </section>
  );
}
