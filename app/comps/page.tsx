"use client";

import { useCallback, useEffect, useState } from "react";
import CompSignupModal from "@/components/CompSignupModal";
import HowCompsWork from "@/components/comps/hub/HowCompsWork";
import LiveNowSection from "@/components/comps/hub/LiveNowSection";
import MyCompsSection from "@/components/comps/hub/MyCompsSection";
import PastCompsSection from "@/components/comps/hub/PastCompsSection";
import RoleCards from "@/components/comps/hub/RoleCards";
import UpcomingCompsSection from "@/components/comps/hub/UpcomingCompsSection";
import { authedFetch } from "@/lib/comps/clientAuth";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import type {
  HubPayload,
  HubUpcomingEvent,
  MePayload,
} from "@/lib/comps/hubTypes";

export default function CompsHubPage() {
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [me, setMe] = useState<MePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupEvent, setSignupEvent] = useState<HubUpcomingEvent | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showTestComps, setShowTestComps] = useState(false);

  const loadHub = useCallback(async () => {
    try {
      const url =
        showTestComps && isAdmin
          ? "/api/comps/hub?include_test=1"
          : "/api/comps/hub";
      const res =
        showTestComps && isAdmin
          ? await authedFetch(url)
          : await fetch(url);
      if (!res.ok) {
        setError("Failed to load competitions");
        return;
      }
      const data = (await res.json()) as HubPayload;
      setHub(data);
      setError(null);
    } catch {
      setError("Failed to load competitions");
    }
  }, [showTestComps, isAdmin]);

  const loadMe = useCallback(async () => {
    try {
      const res = await authedFetch("/api/comps/me");
      if (!res.ok) {
        setMe(null);
        return;
      }
      setMe((await res.json()) as MePayload);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (session) {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const profile = res.ok ? await res.json() : null;
        setIsAdmin((profile?.profile?.role ?? "").toLowerCase() === "admin");
      }
      await loadMe();
    })();
  }, [loadMe]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  useEffect(() => {
    if (!hub || hub.live.length === 0) return;
    const interval = setInterval(loadHub, 10000);
    return () => clearInterval(interval);
  }, [hub, loadHub]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-primary">CCS Competitions</h1>
        {isAdmin && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={showTestComps}
              onChange={(e) => setShowTestComps(e.target.checked)}
              className="rounded border-neutral-600"
            />
            See Test Comps
          </label>
        )}
      </div>
      <p className="mb-2 text-sm text-neutral-400">
        Live results, signups, past winners, and judging — all in one place.
      </p>
      <HowCompsWork />

      {error && (
        <p className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {hub === null && !error ? (
        <p className="py-10 text-center text-neutral-500">Loading…</p>
      ) : hub ? (
        <>
          <LiveNowSection live={hub.live} />
          <RoleCards />
          <MyCompsSection
            me={me}
            historyLimit={3}
            viewAllHref={me ? "/comps/me" : undefined}
          />
          <UpcomingCompsSection
            upcoming={hub.upcoming}
            myUpcoming={me?.upcoming ?? []}
            onSignup={setSignupEvent}
          />
          <PastCompsSection past={hub.past} />
        </>
      ) : null}

      <CompSignupModal
        event={signupEvent}
        open={!!signupEvent}
        onClose={() => {
          setSignupEvent(null);
          loadMe();
          loadHub();
        }}
      />
    </div>
  );
}
