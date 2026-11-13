"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

const TONE_LABEL: Record<string, string> = {
  neutral: "Neutral",
  warning: "Warning (yellow)",
  danger: "Important (red)",
};

export default function AdminNonCcsEventReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<{
    event: Record<string, unknown>;
    competitions: { id: string; name: string; comp_type?: string }[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const meRes = await authedFetch("/api/me");
      if (!meRes.ok) {
        setError("Sign in as a site admin to review submissions.");
        setLoading(false);
        return;
      }
      const me = await meRes.json();
      if ((me.profile?.role ?? "").toLowerCase() !== "admin") {
        setError("This page is for site admins only.");
        setLoading(false);
        return;
      }

      const res = await authedFetch(`/api/non-ccs-events/${id}`);
      if (!res.ok) {
        setError(await apiError(res));
        setLoading(false);
        return;
      }
      setPayload(await res.json());
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-neutral-400">Loading…</main>
    );
  }

  if (error || !payload?.event) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-white">
        <Link href="/admin/non-ccs-events" className="text-sm text-neutral-400 hover:text-white">
          ← Approval queue
        </Link>
        <p className="mt-4 text-red-300">{error ?? "Event not found"}</p>
      </main>
    );
  }

  const e = payload.event;
  const tz = (e.time_zone as string) || DEFAULT_TIME_ZONE;
  const methods = Array.isArray(e.community_payment_methods)
    ? (e.community_payment_methods as { label?: string }[])
    : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-white">
      <Link href="/admin/non-ccs-events" className="text-sm text-neutral-400 hover:text-white">
        ← Approval queue
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Submission review</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Read-only. Approve or reject from the{" "}
        <Link href="/admin/non-ccs-events" className="text-primary underline">
          queue
        </Link>
        .
      </p>

      <dl className="mt-8 space-y-5">
        <div>
          <dt className="text-xs font-medium uppercase text-neutral-500">Status</dt>
          <dd className="mt-1 text-neutral-200">
            {STATUS_LABEL[String(e.approval_status)] ?? String(e.approval_status)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-neutral-500">Event title</dt>
          <dd className="mt-1 text-lg font-semibold text-primary">{String(e.title ?? "")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-neutral-500">Start</dt>
          <dd className="mt-1 text-neutral-200">
            {e.starts_at
              ? formatEventScheduleSubtitle(
                  String(e.starts_at),
                  e.ends_at as string | null,
                  tz,
                  "Comp"
                )
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-neutral-500">Location</dt>
          <dd className="mt-1 text-neutral-200">{String(e.location ?? "—")}</dd>
        </div>
        {e.description ? (
          <div>
            <dt className="text-xs font-medium uppercase text-neutral-500">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-neutral-200">{String(e.description)}</dd>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-neutral-500">Strictly fee (info)</dt>
            <dd className="mt-1 text-neutral-200">
              {e.strictly_price != null ? `$${Number(e.strictly_price).toFixed(2)}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-neutral-500">JnJ fee (info)</dt>
            <dd className="mt-1 text-neutral-200">
              {e.jnj_price != null ? `$${Number(e.jnj_price).toFixed(2)}` : "—"}
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-neutral-500">Payment methods</dt>
          <dd className="mt-1">
            {methods.length === 0 ? (
              <span className="text-neutral-500">None</span>
            ) : (
              <ul className="list-inside list-disc text-neutral-200">
                {methods.map((m, i) => (
                  <li key={i}>{m.label ?? "—"}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        {e.community_payment_disclaimer ? (
          <div>
            <dt className="text-xs font-medium uppercase text-neutral-500">
              Payment disclaimer ({TONE_LABEL[String(e.community_payment_disclaimer_tone)] ?? "—"})
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-neutral-200">
              {String(e.community_payment_disclaimer)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase text-neutral-500">Divisions</dt>
          <dd className="mt-1">
            {(payload.competitions ?? []).length === 0 ? (
              <span className="text-neutral-500">None</span>
            ) : (
              <ul className="list-inside list-disc text-neutral-200">
                {payload.competitions.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      {e.approval_status === "approved" && (
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href={`/host/comps/${id}/operate`}
            className="inline-block rounded-md border border-primary/50 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Operate event →
          </Link>
          <Link
            href={`/admin/comps/events/${id}/ops`}
            className="inline-block text-sm text-neutral-300 underline hover:text-white"
          >
            Comp event ops
          </Link>
          <Link
            href={`/non-ccs-events/${id}`}
            className="inline-block text-sm text-primary underline"
          >
            Public event page →
          </Link>
        </div>
      )}
    </main>
  );
}
