"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";

const SIGN_IN_REQUIRED_MESSAGE =
  "You must be signed in to a Country City Swing account to create or manage a Non-CCS comp event.";

type HostEvent = {
  id: string;
  title: string;
  starts_at: string;
  approval_status: string;
  approval_rejection_reason?: string | null;
  competitions?: { id: string; name: string; comp_type?: string }[];
};

const COMP_TYPE_SHORT: Record<string, string> = {
  jack_and_jill: "JnJ",
  strictly: "Strictly",
  all_american: "All Am.",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export default function HostCompsPage() {
  const pathname = usePathname();
  const authNext = pathname
    ? `/auth?next=${encodeURIComponent(pathname)}`
    : "/auth";

  const [events, setEvents] = useState<HostEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/non-ccs-events/mine");
    if (!res.ok) {
      if (res.status === 401) {
        setSignedIn(false);
        setError(SIGN_IN_REQUIRED_MESSAGE);
        return;
      }
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      setSignedIn(!!session);
      if (!session) {
        setLoading(false);
        return;
      }
      await load();
      setLoading(false);
    })();
  }, [load]);

  const createDraft = async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) {
      setError(SIGN_IN_REQUIRED_MESSAGE);
      return;
    }
    const res = await authedFetch("/api/non-ccs-events", {
      method: "POST",
      body: JSON.stringify({ title: "New comp event" }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        setSignedIn(false);
        setError(SIGN_IN_REQUIRED_MESSAGE);
        return;
      }
      setError(await apiError(res));
      return;
    }
    const data = await res.json();
    window.location.href = `/host/comps/${data.event.id}/edit`;
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-neutral-400">Loading…</main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-white">
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-bold">My Non-CCS comp events</h1>

      {!signedIn ? (
        <div className="mt-6 rounded-lg border border-neutral-600 bg-neutral-800/80 p-6">
          <p className="text-neutral-200">{SIGN_IN_REQUIRED_MESSAGE}</p>
          <p className="mt-2 text-sm text-neutral-400">
            Use the same account you use for comp registration and other CCS features.
          </p>
          <Link
            href={authNext}
            className="btn-signup mt-4 inline-block text-sm px-4 py-2"
          >
            Sign in or create account
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={createDraft}
          className="btn-signup mt-4 text-sm px-4 py-2"
        >
          New event
        </button>
      )}

      {error && signedIn && (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <ul className="mt-8 space-y-4">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-neutral-700 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-primary">{e.title}</h2>
                <p className="text-sm text-neutral-400">
                  {STATUS_LABEL[e.approval_status] ?? e.approval_status}
                </p>
                {e.approval_rejection_reason && (
                  <p className="mt-1 text-sm text-red-300">{e.approval_rejection_reason}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/host/comps/${e.id}/edit`}
                  className="rounded-md border border-neutral-600 px-3 py-1 text-sm hover:bg-neutral-800"
                >
                  Edit
                </Link>
                {e.approval_status === "approved" && (
                  <Link
                    href={`/host/comps/${e.id}/operate`}
                    className="rounded-md border border-primary/50 px-3 py-1 text-sm text-primary"
                  >
                    Operate event
                  </Link>
                )}
              </div>
            </div>
            {e.approval_status === "approved" && (
              <>
                <p className="mt-3 text-sm text-neutral-500">
                  Assign bibs once for the whole event, then import signups into each division.
                </p>
                {(e.competitions ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(e.competitions ?? []).map((c) => {
                      const typeShort =
                        (c.comp_type && COMP_TYPE_SHORT[c.comp_type]) || "";
                      return (
                        <Link
                          key={c.id}
                          href={`/admin/comps/${c.id}`}
                          className="rounded-full border border-neutral-600 px-2.5 py-0.5 text-xs text-neutral-300 hover:border-primary/50"
                        >
                          {c.name}
                          {typeShort ? ` · ${typeShort}` : ""}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
