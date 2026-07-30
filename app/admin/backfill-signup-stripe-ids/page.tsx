"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

type BackfillResult = {
  success?: boolean;
  dryRun?: boolean;
  candidatesMissingIds?: number;
  candidatesSignups?: number;
  candidatesComps?: number;
  candidateIdRange?: { min: number; max: number } | null;
  claimedSessionIds?: number;
  sessionsConsidered?: number;
  wouldUpdate?: number;
  updated?: number;
  ambiguous?: number;
  unmatched?: number;
  message?: string;
  error?: string;
  errors?: { signupId: string; isComp: boolean; error: string }[];
  samples?: unknown;
};

export default function BackfillSignupStripeIdsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const run = async (dryRun: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setResult({ error: "Not signed in. Sign in as an admin and try again." });
        return;
      }
      const res = await fetch("/api/admin/backfill-signup-stripe-ids", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dryRun }),
      });
      const json = (await res.json()) as BackfillResult;
      setResult(json);
      if (!res.ok) {
        setResult((prev) => ({ ...prev, error: json.error ?? "Request failed" }));
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 px-4 py-8 text-neutral-200">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/admin/finances"
          className="mb-6 inline-block text-sm text-neutral-400 hover:text-white"
        >
          ← Back to Finances
        </Link>
        <h1 className="text-xl font-semibold text-white">
          Backfill signup Stripe IDs
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Matches historical Checkout Sessions to paid Stripe event/comp signups missing{" "}
          <code className="rounded bg-neutral-800 px-1">stripe_session_id</code> /{" "}
          <code className="rounded bg-neutral-800 px-1">stripe_payment_intent_id</code>.
          Loads <strong>all</strong> missing signup rows (paged past Supabase&apos;s 1000-row
          default), from oldest through the most recent. Run a dry run first. Admin only.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => run(true)}
            disabled={loading}
            className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {loading ? "Running…" : "Dry run"}
          </button>
          <button
            type="button"
            onClick={() => run(false)}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Running…" : "Live backfill"}
          </button>
        </div>
        {result && (
          <pre className="mt-6 overflow-auto rounded-lg border border-neutral-700 bg-neutral-800 p-4 text-left text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
