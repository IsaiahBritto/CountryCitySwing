"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";

type QueueEvent = {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  approval_status?: string;
  submitted_at?: string | null;
  organizer_profile_id?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function AdminNonCcsEventsPage() {
  const [view, setView] = useState<"pending" | "all">("pending");
  const [events, setEvents] = useState<QueueEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const status = view === "pending" ? "pending" : "all";
    const res = await authedFetch(`/api/admin/non-ccs-events?status=${status}`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
    setError(null);
  }, [view]);

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

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setView("pending")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            view === "pending"
              ? "bg-primary/20 text-primary border border-primary/40"
              : "border border-neutral-600 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          Pending review
        </button>
        <button
          type="button"
          onClick={() => setView("all")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            view === "all"
              ? "bg-primary/20 text-primary border border-primary/40"
              : "border border-neutral-600 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          All community events
        </button>
      </div>

      {error && <p className="mt-2 text-red-300">{error}</p>}
      <ul className="mt-8 space-y-6">
        {events.map((e) => {
          const approved = e.approval_status === "approved";
          const pending = e.approval_status === "pending";
          return (
            <li key={e.id} className="rounded-lg border border-neutral-700 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold text-primary">{e.title}</h2>
                {view === "all" && e.approval_status && (
                  <span className="text-xs uppercase text-neutral-500">
                    {STATUS_LABEL[e.approval_status] ?? e.approval_status}
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-400">{e.location}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {approved && (
                  <Link
                    href={`/host/comps/${e.id}/operate`}
                    className="text-primary underline hover:text-primary/80"
                  >
                    Operate event
                  </Link>
                )}
                <Link
                  href={`/admin/non-ccs-events/${e.id}`}
                  className="text-neutral-400 underline hover:text-white"
                >
                  View submission
                </Link>
                {approved && (
                  <Link
                    href={`/non-ccs-events/${e.id}`}
                    className="text-neutral-400 underline hover:text-white"
                  >
                    Public page
                  </Link>
                )}
              </div>
              {pending && view === "pending" && (
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
              )}
            </li>
          );
        })}
      </ul>
      {events.length === 0 && (
        <p className="mt-8 text-neutral-400">
          {view === "pending"
            ? "No pending submissions."
            : "No community events found."}
        </p>
      )}
    </main>
  );
}
