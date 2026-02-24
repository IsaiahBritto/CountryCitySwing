"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon, FolderIcon } from "@heroicons/react/24/solid";
import Link from "next/link";

const FOLDERS_PER_PAGE = 6;

export interface NcsnFolderItem {
  id: string;
  name: string;
  createdTime: string;
}

function formatFolderLabel(name: string, createdTime: string) {
  try {
    const d = new Date(createdTime);
    const dateStr = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return name?.trim() ? `${name} · ${dateStr}` : dateStr;
  } catch {
    return name || "Photos";
  }
}

export default function NcsnPhotosByDate() {
  const [pages, setPages] = useState<NcsnFolderItem[][]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (pageToken: string | null) => {
    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`/api/ncsn-photos/folders?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to load folders");
    }
    return { folders: data.folders ?? [], nextPageToken: data.nextPageToken ?? null };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(null)
      .then(({ folders, nextPageToken: token }) => {
        if (cancelled) return;
        setPages(folders.length ? [folders] : []);
        setNextPageToken(token);
        setCurrentPageIndex(0);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load folders");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const goNext = () => {
    const token = nextPageToken;
    if (!token || loadingNext) return;
    setLoadingNext(true);
    fetchPage(token)
      .then(({ folders, nextPageToken: token }) => {
        setPages((prev) => (folders.length ? [...prev, folders] : prev));
        setNextPageToken(token);
        setCurrentPageIndex((i) => i + 1);
      })
      .finally(() => setLoadingNext(false));
  };

  const goPrev = () => {
    setCurrentPageIndex((i) => Math.max(0, i - 1));
  };

  const currentFolders = pages[currentPageIndex] ?? [];
  const hasPrev = currentPageIndex > 0;
  const hasNext = Boolean(nextPageToken) || loadingNext;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mb-3" />
        <p className="text-sm">Loading photos by date…</p>
      </div>
    );
  }

  if (error) {
    const isMissingConfig = /missing env|not configured/i.test(error);
    return (
      <div className="text-center py-12 text-gray-400 text-sm max-w-md mx-auto">
        {isMissingConfig ? (
          <>
            <p>Photos by date is not configured.</p>
            <p className="mt-2 text-gray-500">
              Add <code className="bg-neutral-800 px-1 rounded">GOOGLE_DRIVE_NCSN_PHOTOS_FOLDER_ID</code> to your .env and <strong>restart the dev server</strong>.
            </p>
          </>
        ) : (
          error
        )}
      </div>
    );
  }

  if (pages.length === 0 || currentFolders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No photo folders yet.
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-2">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={!hasPrev}
          aria-label="Previous folders"
          className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>

        <div className="flex flex-wrap justify-center gap-3 flex-1 min-w-0">
          {currentFolders.map((folder) => (
            <Link
              key={folder.id}
              href={`/media/folder/${folder.id}?name=${encodeURIComponent(folder.name)}`}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 hover:border-primary/50 text-left transition-colors min-w-[140px] max-w-[220px]"
            >
              <FolderIcon className="w-6 h-6 shrink-0 text-primary" />
              <span className="text-sm text-gray-200 truncate">
                {formatFolderLabel(folder.name, folder.createdTime)}
              </span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={!nextPageToken && !loadingNext}
          aria-label="Next folders"
          className="p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors"
        >
          {loadingNext ? (
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          ) : (
            <ChevronRightIcon className="w-6 h-6" />
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-3 text-center">
        {currentPageIndex + 1} of {pages.length}
        {nextPageToken && !loadingNext ? " · Use arrows for more" : ""}
      </p>
    </div>
  );
}
