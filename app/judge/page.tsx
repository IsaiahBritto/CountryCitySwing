"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { roundTitle } from "@/lib/comps/roundChain";

interface CompetitionSummary {
  id: string;
  name: string;
  comp_type: string;
  event: { title: string; starts_at: string } | null;
}

interface JudgeRound {
  id: string;
  round_type: string;
  judged_role: "lead" | "follow" | null;
  status: string;
  sheetStatus: "draft" | "submitted" | null;
  readyToJudge: boolean;
}

interface JudgeAssignment {
  id: string;
  competitionId: string;
  judgeRole: "judge" | "chief_judge";
  competition: CompetitionSummary | null;
  rounds: JudgeRound[];
}

function roleLabel(role: "judge" | "chief_judge"): string {
  return role === "chief_judge" ? "Chief judge" : "Judge";
}

function roundStatusLabel(r: JudgeRound): string {
  if (r.readyToJudge) return "Ready to judge";
  if (r.status === "open" && r.sheetStatus === "submitted") return "Submitted";
  if (r.status === "checkin") return "Check-in";
  if (r.status === "closed") return "Closed";
  if (r.status === "tabulated" || r.status === "published") return "Done";
  return r.status;
}

export default function JudgeHomePage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [assignments, setAssignments] = useState<JudgeAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        if (!cancelled) {
          setSignedIn(false);
          setLoading(false);
        }
        return;
      }
      setSignedIn(true);
      const res = await authedFetch("/api/judge/rounds");
      if (cancelled) return;
      if (!res.ok) {
        setForbidden(res.status === 403);
        setError(res.status === 403 ? null : await apiError(res));
        setAssignments([]);
      } else {
        const data = await res.json();
        setAssignments(data.assignments ?? []);
        setForbidden(false);
      }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-center text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold text-primary">Judge sign-in</h1>
        <p className="mb-6 text-neutral-400">Sign in to see your assigned rounds.</p>
        <Link
          href="/auth"
          className="inline-block rounded-md bg-primary px-4 py-2 font-medium text-black"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-primary">Judging</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Your assigned competitions. Score when a round shows Ready to judge.
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {forbidden && (
        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
          No judge assignment found for this account. Ask the director to assign
          you, or sign in with the same email they used when adding you.
        </div>
      )}

      {assignments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Your assignments
          </h2>
          {assignments.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4"
            >
              <div className="font-semibold text-white">
                {a.competition?.name ?? "Competition"}
              </div>
              <div className="text-sm text-neutral-400">
                {a.competition?.event?.title}
                {" · "}
                <span
                  className={
                    a.judgeRole === "chief_judge"
                      ? "text-primary"
                      : "text-neutral-400"
                  }
                >
                  {roleLabel(a.judgeRole)}
                </span>
              </div>

              {a.rounds.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">
                  Waiting for the director to start a round.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {a.rounds.map((r) => (
                    <div
                      key={r.id}
                      className={
                        "flex items-center justify-between rounded-lg border px-3 py-2 " +
                        (r.readyToJudge
                          ? "border-primary/50 bg-primary/5"
                          : "border-neutral-800 bg-neutral-900/40")
                      }
                    >
                      <span className="text-sm text-neutral-200">
                        {roundTitle(r)}
                      </span>
                      {r.readyToJudge ? (
                        <Link
                          href={`/judge/${r.id}`}
                          className="rounded bg-primary px-2 py-1 text-xs font-semibold text-black"
                        >
                          Ready to judge
                        </Link>
                      ) : (
                        <span className="text-xs text-neutral-500">
                          {roundStatusLabel(r)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
