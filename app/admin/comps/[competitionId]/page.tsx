"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import EntriesTab from "@/components/comps/admin/EntriesTab";
import JudgesTab from "@/components/comps/admin/JudgesTab";
import RoundsTab from "@/components/comps/admin/RoundsTab";

type Tab = "entries" | "judges" | "rounds";

const TYPE_LABEL: Record<string, string> = {
  jack_and_jill: "Jack & Jill",
  strictly: "Strictly",
};

export default function CompetitionConsolePage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = use(params);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("entries");

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/comps/${competitionId}`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setDetail(await res.json());
  }, [competitionId]);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const me = res.ok ? await res.json() : null;
      const admin = (me?.profile?.role ?? "").toLowerCase() === "admin";
      setIsAdmin(admin);
      if (admin) await load();
      setLoading(false);
    })();
  }, [load]);

  const markCompleted = async () => {
    const next = detail.competition.status === "completed" ? "in_progress" : "completed";
    const res = await authedFetch(`/api/admin/comps/${competitionId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) load();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="text-center text-neutral-400">Checking access…</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">Access denied</h1>
        <p className="text-neutral-400">This page is for administrators only.</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="text-center text-red-300">{error ?? "Loading…"}</p>
      </div>
    );
  }

  const { competition, entries, judges, rounds } = detail;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin/comps" className="text-sm text-neutral-400 hover:text-primary">
        ← All competitions
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{competition.name}</h1>
          <p className="text-sm text-neutral-400">
            {TYPE_LABEL[competition.comp_type]} · {competition.event?.title}
            {competition.event?.starts_at &&
              ` · ${new Date(competition.event.starts_at).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-neutral-700/60 px-2 py-1 text-xs font-semibold text-neutral-300">
            {competition.status.replace("_", " ")}
          </span>
          <button
            onClick={markCompleted}
            className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 hover:border-primary/60"
          >
            {competition.status === "completed" ? "Reopen" : "Mark completed"}
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-neutral-800">
        {(
          [
            ["entries", `Entries (${entries.length})`],
            ["judges", `Judges (${judges.length})`],
            ["rounds", `Rounds (${rounds.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "px-4 py-2 text-sm font-medium transition " +
              (tab === key
                ? "border-b-2 border-primary text-primary"
                : "text-neutral-400 hover:text-white")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "entries" && (
        <EntriesTab
          competitionId={competitionId}
          compType={competition.comp_type}
          entries={entries}
          onChanged={load}
        />
      )}
      {tab === "judges" && (
        <JudgesTab
          competitionId={competitionId}
          judges={judges}
          cjInPanel={competition.cj_in_panel}
          onChanged={load}
        />
      )}
      {tab === "rounds" && (
        <RoundsTab
          competitionId={competitionId}
          compType={competition.comp_type}
          entryCount={entries.length}
          rounds={rounds}
          onChanged={load}
        />
      )}
    </div>
  );
}
