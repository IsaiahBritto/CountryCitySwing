"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  formatTimeRangeWithTimeZone,
} from "@/lib/utils/dateHelpers";

type LookupResponse = {
  success?: boolean;
  instructorName?: string;
  lessonStart?: string;
  lessonEnd?: string;
  timeZone?: string | null;
  price?: number | null;
  location?: string | null;
  error?: string;
};

function CancelPrivateLessonContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchLookup = useCallback(async () => {
    if (!token) {
      setLookupError("This cancel link is missing a token.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/private-lesson-bookings/lookup?token=${encodeURIComponent(token)}`
      );
      const data = (await res.json()) as LookupResponse;
      if (!res.ok) {
        setLookup(null);
        setLookupError(data.error || "This booking could not be found.");
      } else {
        setLookup(data);
      }
    } catch {
      setLookupError("Could not load booking details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLookup();
  }, [fetchLookup]);

  async function handleCancel() {
    if (!token) return;
    if (!confirm("Cancel this private lesson booking?")) return;

    setCanceling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/private-lesson-bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelToken: token }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setCancelError(data.error || "Could not cancel this booking.");
      } else {
        setCanceled(true);
      }
    } catch {
      setCancelError("Could not cancel this booking. Please try again.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-gray-100 px-4 py-16">
      <div className="mx-auto max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-primary text-center mb-2">
          Cancel Private Lesson
        </h1>

        {loading && (
          <p className="text-center text-gray-400 text-sm">Loading booking…</p>
        )}

        {!loading && lookupError && (
          <div className="space-y-4 text-center">
            <p className="text-gray-300 text-sm">{lookupError}</p>
            <Link href="/" className="text-primary underline underline-offset-2">
              Back to Country City Swing
            </Link>
          </div>
        )}

        {!loading && canceled && (
          <div className="space-y-4 text-center">
            <p className="text-gray-200">
              Your lesson booking has been canceled. The time slot is available again for others to book.
            </p>
            <Link href="/" className="text-primary underline underline-offset-2">
              Back to Country City Swing
            </Link>
          </div>
        )}

        {!loading && !lookupError && lookup && !canceled && (
          <div className="space-y-4">
            <p className="text-center text-sm text-gray-400">
              Review the details below before canceling.
            </p>
            <div className="rounded border border-neutral-700 bg-neutral-800 p-4 text-sm space-y-2">
              <p>
                <span className="text-primary font-medium">Instructor: </span>
                {lookup.instructorName}
              </p>
              {lookup.lessonStart && (
                <p>
                  <span className="text-primary font-medium">When: </span>
                  {(() => {
                    const tz = lookup.timeZone || DEFAULT_TIME_ZONE;
                    const dateStr = formatDateInTimeZone(lookup.lessonStart!, tz, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    });
                    const { startTime, endTime, tzAbbrev } = formatTimeRangeWithTimeZone(
                      lookup.lessonStart!,
                      lookup.lessonEnd || lookup.lessonStart!,
                      tz
                    );
                    return `${dateStr} • ${startTime} – ${endTime}${tzAbbrev ? ` ${tzAbbrev}` : ""}`;
                  })()}
                </p>
              )}
              {lookup.location?.trim() && (
                <p>
                  <span className="text-primary font-medium">Location: </span>
                  {lookup.location.trim()}
                </p>
              )}
              {lookup.price != null && !Number.isNaN(Number(lookup.price)) && (
                <p>
                  <span className="text-primary font-medium">Price: </span>${Number(lookup.price).toFixed(2)}
                </p>
              )}
            </div>

            {cancelError && (
              <p className="text-center text-sm text-red-400">{cancelError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Link
                href="/"
                className="flex-1 rounded-md bg-neutral-700 px-4 py-2 text-center text-white transition-colors hover:bg-neutral-600"
              >
                Keep booking
              </Link>
              <button
                type="button"
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {canceling ? "Canceling…" : "Cancel booking"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CancelPrivateLessonPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-gray-100 px-4 py-16">
          <p className="text-center text-gray-400">Loading…</p>
        </main>
      }
    >
      <CancelPrivateLessonContent />
    </Suspense>
  );
}
