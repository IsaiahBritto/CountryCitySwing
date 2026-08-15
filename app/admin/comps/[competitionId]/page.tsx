"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { judgeDisplayCount } from "@/lib/comps/judgeDisplayCount";
import EntriesTab from "@/components/comps/admin/EntriesTab";
import JudgesTab from "@/components/comps/admin/JudgesTab";
import RoundsTab from "@/components/comps/admin/RoundsTab";
import PrizesTab from "@/components/comps/admin/PrizesTab";

type Tab = "entries" | "judges" | "rounds" | "prizes";

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
  const [testActionBusy, setTestActionBusy] = useState(false);
  const [testActionMsg, setTestActionMsg] = useState<string | null>(null);
  const [maxFloorCouples, setMaxFloorCouples] = useState("");
  const [maxFloorSaving, setMaxFloorSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/comps/${competitionId}`);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setDetail(await res.json());
  }, [competitionId]);

  useEffect(() => {
    if (detail?.competition?.max_floor_couples != null) {
      setMaxFloorCouples(String(detail.competition.max_floor_couples));
    } else {
      setMaxFloorCouples("");
    }
  }, [detail?.competition?.max_floor_couples]);

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

  const saveMaxFloorCouples = async () => {
    const parsed = Number(maxFloorCouples);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError("Enter a max couples on floor value (1 or greater) before saving.");
      return;
    }
    setMaxFloorSaving(true);
    const res = await authedFetch(`/api/admin/comps/${competitionId}`, {
      method: "PATCH",
      body: JSON.stringify({ max_floor_couples: Math.floor(parsed) }),
    });
    setMaxFloorSaving(false);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    load();
  };

  const resetTestComp = async () => {
    if (
      !confirm(
        "Reset this test comp? All rounds will be deleted (entries and judges preserved). You will need to re-enable each round."
      )
    ) {
      return;
    }
    setTestActionBusy(true);
    setTestActionMsg(null);
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/test-reset`,
      { method: "POST" }
    );
    setTestActionBusy(false);
    if (!res.ok) {
      setTestActionMsg(await apiError(res));
      return;
    }
    setTestActionMsg("Test comp reset — re-enable rounds to continue.");
    load();
  };

  const ensureTestJudges = async () => {
    setTestActionBusy(true);
    setTestActionMsg(null);
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/test-judges`,
      { method: "POST" }
    );
    setTestActionBusy(false);
    if (!res.ok) {
      setTestActionMsg(await apiError(res));
      return;
    }
    setTestActionMsg("Test judges assigned.");
    load();
  };

  if (loading) {
    return (
      <div className="py-12">
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
      <div className="py-12">
        <p className="text-center text-red-300">{error ?? "Loading…"}</p>
      </div>
    );
  }

  const { competition, entries, judges, rounds } = detail;

  const tabs: [Tab, string][] = [
    ["entries", `Entries (${entries.length})`],
    ["judges", `Judges (${judgeDisplayCount(judges)})`],
    ["rounds", `Rounds (${rounds.length})`],
    ["prizes", "Prizes"],
  ];
  return (
    <div className="w-full py-8">
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
        <div className="flex flex-wrap items-center gap-3">
          {competition.test_comp && (
            <>
              <span className="rounded bg-violet-500/20 px-2 py-1 text-xs font-semibold text-violet-300">
                test comp
              </span>
              <button
                onClick={ensureTestJudges}
                disabled={testActionBusy}
                className="rounded-md border border-violet-500/50 px-3 py-1.5 text-sm text-violet-300 hover:border-violet-400"
              >
                Ensure test judges
              </button>
              <button
                onClick={resetTestComp}
                disabled={testActionBusy}
                className="rounded-md border border-amber-500/50 px-3 py-1.5 text-sm text-amber-300 hover:border-amber-400"
              >
                Reset test comp
              </button>
            </>
          )}
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

      {testActionMsg && (
        <div className="mb-4 rounded-md border border-neutral-600 bg-neutral-800/60 p-3 text-sm text-neutral-300">
          {testActionMsg}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Max couples on floor <span className="text-amber-400">*</span>
          </label>
          <input
            type="number"
            min={1}
            required
            placeholder="Required"
            value={maxFloorCouples}
            onChange={(e) => setMaxFloorCouples(e.target.value)}
            className="w-24 rounded-md border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          onClick={saveMaxFloorCouples}
          disabled={maxFloorSaving || maxFloorCouples.trim() === ""}
          className="rounded-md border border-neutral-600 px-3 py-2 text-sm text-neutral-300 hover:border-primary/60 disabled:opacity-50"
        >
          {maxFloorSaving ? "Saving…" : "Save floor limit"}
        </button>
        <p className="text-xs text-neutral-500">
          Required per competition before heats can be set up (bib order, no randomization).
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-neutral-800 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          tabs
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition " +
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
          compType={competition.comp_type}
          judges={judges}
          rounds={rounds}
          cjInPanel={competition.cj_in_panel}
          leadHeadJudgeAssignmentId={
            competition.lead_head_judge_assignment_id ?? null
          }
          followHeadJudgeAssignmentId={
            competition.follow_head_judge_assignment_id ?? null
          }
          onChanged={load}
        />
      )}
      {tab === "rounds" && (
        <RoundsTab
          competitionId={competitionId}
          compType={competition.comp_type}
          entryCount={entries.length}
          testComp={competition.test_comp}
          cjInPanel={competition.cj_in_panel}
          rounds={rounds}
          onChanged={load}
        />
      )}
      {tab === "prizes" && (
        <PrizesTab competitionId={competitionId} />
      )}
    </div>
  );
}
