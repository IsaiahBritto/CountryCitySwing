"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatEstimatedWait,
  type UserRequestWithEstimate,
} from "@/lib/spotify/requestWaitEstimate";

type MyRequestsPanelProps = {
  accessToken: string | null;
  refreshKey?: number;
};

function statusLabel(request: UserRequestWithEstimate): string {
  switch (request.status) {
    case "now_playing":
      return "Playing now";
    case "played":
      return "Already played";
    case "queued":
      return formatEstimatedWait(request.estimatedWaitMs);
    default:
      return "Estimate unavailable";
  }
}

export default function MyRequestsPanel({
  accessToken,
  refreshKey = 0,
}: MyRequestsPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<UserRequestWithEstimate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/social/session");
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch("/api/social/my-requests", { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to load requests"
        );
      }
      setRequests(
        (data as { requests?: UserRequestWithEstimate[] }).requests ?? []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!open) return;
    loadRequests();
    const intervalId = window.setInterval(loadRequests, 10_000);
    return () => window.clearInterval(intervalId);
  }, [open, loadRequests, refreshKey]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests, refreshKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto px-4 py-2 rounded border border-neutral-600 text-sm text-gray-200 hover:border-amber-600/50 hover:text-amber-100 transition-colors"
      >
        My Requests
        {requests.length > 0 ? ` (${requests.length})` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-requests-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="h-full w-full max-w-md bg-neutral-900 border-l border-neutral-700 shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-neutral-800">
              <h2
                id="my-requests-title"
                className="text-lg font-semibold text-neutral-100"
              >
                My Requests
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-neutral-400 hover:text-neutral-200"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && requests.length === 0 && (
                <p className="text-sm text-neutral-500">Loading…</p>
              )}
              {error && (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}
              {!loading && !error && requests.length === 0 && (
                <p className="text-sm text-neutral-500">
                  You haven&apos;t submitted any songs yet tonight.
                </p>
              )}
              {requests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 space-y-1"
                >
                  <p className="text-sm font-medium text-neutral-100 truncate">
                    {request.name}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    {request.primaryArtist}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] uppercase tracking-wide text-amber-300/90">
                      {request.genreLabel}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {statusLabel(request)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
