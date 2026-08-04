"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MyCompsSection from "@/components/comps/hub/MyCompsSection";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch } from "@/lib/comps/clientAuth";
import type { MePayload } from "@/lib/comps/hubTypes";

export default function MyCompsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-10">
          <p className="text-center text-neutral-400">Loading…</p>
        </div>
      }
    >
      <MyCompsPageInner />
    </Suspense>
  );
}

function MyCompsPageInner() {
  const searchParams = useSearchParams();
  const highlightCompId = searchParams.get("comp");
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<MePayload | null>(null);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session) {
      setSignedIn(false);
      setMe(null);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    const res = await authedFetch("/api/comps/me");
    if (res.ok) {
      setMe((await res.json()) as MePayload);
    } else {
      setMe(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!highlightCompId || loading) return;
    const el = document.getElementById(`comp-${highlightCompId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCompId, loading, me]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/comps" className="text-sm text-neutral-400 hover:text-primary">
        ← Comps hub
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-primary">My comps</h1>

      {loading ? (
        <p className="text-center text-neutral-400">Loading…</p>
      ) : !signedIn ? (
        <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-6 text-center">
          <p className="mb-4 text-neutral-300">
            Sign in to see your comp registrations and history.
          </p>
          <Link
            href="/auth"
            className="inline-block rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Sign in
          </Link>
        </div>
      ) : me &&
        me.upcoming.length === 0 &&
        me.history.length === 0 ? (
        <p className="text-sm text-neutral-500">
          You have no upcoming registrations or past competitions yet.
        </p>
      ) : (
        <MyCompsSection
          me={me}
          highlightCompId={highlightCompId}
          showHistoryHeading={false}
        />
      )}
    </div>
  );
}
