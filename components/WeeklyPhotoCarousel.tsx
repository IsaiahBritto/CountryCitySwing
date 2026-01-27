"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";

const BATCH_SIZE = 20;
const LAZY_WINDOW = 1; // load current ± LAZY_WINDOW
const FETCH_MORE_THRESHOLD = 3; // fetch next batch when within this many of end

export interface WeeklyPhotoItem {
  id: string;
  name: string;
  createdTime: string;
}

function formatCaption(name: string, createdTime: string) {
  try {
    const d = new Date(createdTime);
    const dateStr = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return name ? `${name} · ${dateStr}` : dateStr;
  } catch {
    return name || "Weekly class photo";
  }
}

export default function WeeklyPhotoCarousel() {
  const [items, setItems] = useState<WeeklyPhotoItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const fetchBatch = useCallback(
    async (pageToken: string | null = null) => {
      const params = new URLSearchParams({ pageSize: String(BATCH_SIZE) });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`/api/weekly-photo?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load photos");
      const data = await res.json();
      return { files: data.files ?? [], nextPageToken: data.nextPageToken ?? null };
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBatch(null)
      .then(({ files, nextPageToken: token }) => {
        if (cancelled) return;
        setItems(files);
        setNextPageToken(token);
        setCurrentIndex(0);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load photos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchBatch]);

  useEffect(() => {
    if (loadingMore || !nextPageToken || items.length === 0) return;
    if (currentIndex < items.length - FETCH_MORE_THRESHOLD) return;

    let cancelled = false;
    setLoadingMore(true);
    fetchBatch(nextPageToken)
      .then(({ files, nextPageToken: token }) => {
        if (cancelled) return;
        setItems((prev) => [...prev, ...files]);
        setNextPageToken(token);
      })
      .catch(() => {
        /* ignore; we still have current batch */
      })
      .finally(() => {
        if (!cancelled) setLoadingMore(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentIndex, items.length, nextPageToken, loadingMore, fetchBatch]);

  const next = () =>
    setCurrentIndex((i) =>
      i >= items.length - 1 ? 0 : i + 1
    );
  const prev = () =>
    setCurrentIndex((i) =>
      i <= 0 ? items.length - 1 : i - 1
    );

  const handleTouchStart = (e: React.TouchEvent) =>
    (touchStartX.current = e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  const shouldLoadImage = (index: number) =>
    Math.abs(index - currentIndex) <= LAZY_WINDOW;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent mb-4" />
        <p>Loading weekly photos…</p>
      </div>
    );
  }

  if (error || items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        {error ? (
          <p>{error}</p>
        ) : (
          <p>No weekly photos yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-4xl w-full px-4">
      <div
        className="overflow-hidden rounded-xl bg-neutral-800/50 border border-neutral-700 shadow-glow"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-400 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="shrink-0 w-full flex flex-col items-center"
              style={{ flexBasis: "100%" }}
            >
              <div className="relative w-full aspect-4/3 max-h-[70vh] bg-neutral-800 flex items-center justify-center">
                {shouldLoadImage(index) ? (
                  <img
                    src={`/api/weekly-photo/${item.id}`}
                    alt={item.name}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div
                    className="w-full h-full bg-neutral-800 animate-pulse"
                    style={{ minHeight: 280 }}
                  />
                )}
              </div>
              <div className="w-full py-3 px-4 bg-black/40 text-center">
                <p className="text-sm text-gray-300 truncate max-w-full">
                  {formatCaption(item.name, item.createdTime)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {index + 1} of {items.length}
                  {nextPageToken || loadingMore ? " …" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={prev}
        aria-label="Previous photo"
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600 flex items-center justify-center text-white shadow-lg transition-colors"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next photo"
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600 flex items-center justify-center text-white shadow-lg transition-colors"
      >
        <ChevronRightIcon className="w-5 h-5" />
      </button>

      <div className="flex justify-center gap-1.5 mt-4 flex-wrap">
        {items.slice(0, Math.min(items.length, 15)).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrentIndex(i)}
            aria-label={`Go to photo ${i + 1}`}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentIndex ? "bg-primary scale-125" : "bg-neutral-600 hover:bg-neutral-500"
            }`}
          />
        ))}
        {items.length > 15 && (
          <span className="text-xs text-gray-500 self-center ml-1">
            +{items.length - 15}
          </span>
        )}
      </div>
    </div>
  );
}
