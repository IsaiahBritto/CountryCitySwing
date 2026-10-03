"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CompLevelBadge from "@/components/CompLevelBadge";
import {
  tnStateCardLinkClass,
  tnStateCompNameClass,
  tnStateMutedTextClass,
} from "@/lib/compLevels";
import CompPodiumPreview from "@/components/comps/hub/CompPodiumPreview";
import CompTypeToggle, {
  type HubCompType,
} from "@/components/comps/hub/CompTypeToggle";
import TestBadge from "@/components/comps/hub/TestBadge";
import { COMP_TYPE_LABEL, type HubPayload } from "@/lib/comps/hubTypes";
import { collectTnStateWinners, tnStateByCompType } from "@/lib/comps/tnStateWinners";

function parseDivisionParam(value: string | null): HubCompType {
  if (value === "jack_and_jill") return "jack_and_jill";
  return "strictly";
}

function TnStateWinnersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeType = parseDivisionParam(searchParams.get("division"));

  const loadHub = useCallback(async () => {
    try {
      const res = await fetch("/api/comps/hub");
      if (!res.ok) {
        setError("Failed to load Tennessee State results");
        return;
      }
      setHub((await res.json()) as HubPayload);
      setError(null);
    } catch {
      setError("Failed to load Tennessee State results");
    }
  }, []);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  const rows = useMemo(() => {
    if (!hub) return [];
    return tnStateByCompType(hub.past, activeType);
  }, [hub, activeType]);

  const hasAnyTn = useMemo(() => {
    if (!hub) return false;
    return collectTnStateWinners(hub.past).length > 0;
  }, [hub]);

  const setActiveType = (type: HubCompType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("division", type);
    router.replace(`/comps/tn-state?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/comps"
        className="mb-6 inline-block text-sm text-neutral-400 hover:text-primary"
      >
        ← Competition results
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-white">
          Tennessee State Champions
        </h1>
        <CompLevelBadge level="TN State" />
      </div>
      <p className="mb-6 text-sm text-neutral-400">
        All published TN State comp winners. Tap a division for full scoring
        sheets.
      </p>

      {error && (
        <p className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {hub === null && !error ? (
        <p className="py-10 text-center text-neutral-500">Loading…</p>
      ) : hasAnyTn ? (
        <>
          <div className="mb-6">
            <CompTypeToggle activeType={activeType} onTypeChange={setActiveType} />
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No published {COMP_TYPE_LABEL[activeType]} TN State results yet.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map(({ event, comp }) => (
                <Link
                  key={comp.id}
                  href={`/comps/${comp.id}`}
                  className={tnStateCardLinkClass}
                >
                  <div className="text-base font-semibold text-white">
                    {event.title}
                    {event.test_event && <TestBadge />}
                  </div>
                  <div className="text-sm text-neutral-400">
                    {event.starts_at &&
                      new Date(event.starts_at).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    {event.location ? ` · ${event.location}` : ""}
                  </div>
                  <div className={`mt-2 ${tnStateCompNameClass}`}>
                    {comp.name}
                    {comp.test_comp && <TestBadge />}
                  </div>
                  <div className={tnStateMutedTextClass}>
                    {COMP_TYPE_LABEL[comp.comp_type] ?? comp.comp_type}
                  </div>
                  <CompPodiumPreview podium={comp.podium} />
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          No Tennessee State results published yet — check back after the next TN
          State comp!
        </p>
      )}
    </div>
  );
}

export default function TnStateWinnersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-10">
          <p className="text-center text-neutral-500">Loading…</p>
        </div>
      }
    >
      <TnStateWinnersPageInner />
    </Suspense>
  );
}
