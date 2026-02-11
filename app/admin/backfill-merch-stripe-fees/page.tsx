"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

export default function BackfillMerchStripeFeesPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    updated?: number;
    total?: number;
    message?: string;
    error?: string;
    errors?: { orderId: string; error: string }[];
  } | null>(null);

  const runBackfill = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setResult({ error: "Not signed in. Sign in as an admin and try again." });
        return;
      }
      const res = await fetch("/api/admin/backfill-merch-stripe-fees", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      setResult(json);
      if (!res.ok) setResult((prev) => ({ ...prev, error: json.error ?? "Request failed" }));
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 px-4 py-8 text-neutral-200">
      <div className="mx-auto max-w-lg">
        <Link
          href="/admin/finances"
          className="mb-6 inline-block text-sm text-neutral-400 hover:text-white"
        >
          ← Back to Finances
        </Link>
        <h1 className="text-xl font-semibold text-white">
          Backfill merch Stripe tax/fee
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Fills in <code className="rounded bg-neutral-800 px-1">stripe_tax_amount</code> and{" "}
          <code className="rounded bg-neutral-800 px-1">stripe_processing_fee</code> for existing
          paid Stripe merch orders using data from Stripe. Admin only.
        </p>
        <button
          type="button"
          onClick={runBackfill}
          disabled={loading}
          className="mt-6 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Running…" : "Run backfill"}
        </button>
        {result && (
          <pre className="mt-6 overflow-auto rounded-lg border border-neutral-700 bg-neutral-800 p-4 text-left text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
