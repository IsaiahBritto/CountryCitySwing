"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";

type QueueEvent = {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  submitted_at?: string | null;
  organizer_profile_id?: string | null;
};

export default function AdminNonCcsEventsPage() {
  const [events, setEvents] = useState<QueueEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/non-ccs-events?status=pending");
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    const res = await authedFetch(`/api/admin/non-ccs-events/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res.ok) setError(await apiError(res));
    else load();
  };

  const reject = async (id: string) => {
    const reason = (rejectReason[id] ?? "").trim();
    if (!reason) {
      setError("Rejection reason required");
      return;
    }
    const res = await authedFetch(`/api/admin/non-ccs-events/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) setError(await apiError(res));
    else load();
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-white">
      <Link href="/admin/comps" className="text-sm text-neutral-400 hover:text-white">
        ← Admin comps
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Non-CCS event approvals</h1>
      {error && <p className="mt-2 text-red-300">{error}</p>}
      <ul className="mt-8 space-y-6">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-neutral-700 p-4">
            <h2 className="font-semibold text-primary">{e.title}</h2>
            <p className="text-sm text-neutral-400">{e.location}</p>
            <Link
              href={`/non-ccs-events/${e.id}`}
              className="mt-1 inline-block text-sm text-primary underline"
            >
              Preview (if approved)
            </Link>
            <Link
              href={`/admin/non-ccs-events/${e.id}`}
              className="ml-4 text-sm text-neutral-400 underline"
            >
              View submission
            </Link>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => approve(e.id)}
                className="btn-signup px-3 py-1 text-sm"
              >
                Approve
              </button>
              <input
                className="min-w-[200px] flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm"
                placeholder="Rejection reason"
                value={rejectReason[e.id] ?? ""}
                onChange={(ev) =>
                  setRejectReason({ ...rejectReason, [e.id]: ev.target.value })
                }
              />
              <button
                type="button"
                onClick={() => reject(e.id)}
                className="rounded border border-red-500/60 px-3 py-1 text-sm text-red-300"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
      {events.length === 0 && (
        <p className="mt-8 text-neutral-400">No pending submissions.</p>
      )}
    </main>
  );
}
