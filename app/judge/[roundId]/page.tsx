"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import { compBtnTabActive } from "@/lib/comps/buttonStyles";
import CallbackSheet from "@/components/comps/judge/CallbackSheet";
import FinalsSheet from "@/components/comps/judge/FinalsSheet";

const ROUND_LABEL: Record<string, string> = {
  prelims: "Prelims",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

export default function JudgeRoundPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-12">
          <p className="text-center text-neutral-400">Loading round…</p>
        </div>
      }
    >
      <JudgeRoundInner params={params} />
    </Suspense>
  );
}

function JudgeRoundInner({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Admin override: /judge/[roundId]?as=<judgeAssignmentId>
  const asAssignment = searchParams.get("as");

  const [context, setContext] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = asAssignment
      ? `/api/judge/rounds/${roundId}?judge_assignment_id=${asAssignment}`
      : `/api/judge/rounds/${roundId}`;
    const res = await authedFetch(url);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    setContext(await res.json());
    setError(null);
  }, [roundId, asAssignment]);

  useEffect(() => {
    load();
  }, [load]);

  // While waiting on check-in, poll until the round opens.
  useEffect(() => {
    if (!context || context.round.status !== "checkin") return;
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, [context, load]);

  if (error) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <p className="mb-4 text-red-300">{error}</p>
        <Link href="/judge" className="text-sm text-primary">
          ← Back to my rounds
        </Link>
      </div>
    );
  }
  if (!context) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-center text-neutral-400">Loading round…</p>
      </div>
    );
  }

  const { round, competition, entries, scores, sheet, scoringScope, siblingRound } =
    context;
  const title = `${competition.name} · ${ROUND_LABEL[round.round_type] ?? round.round_type}${
    round.judged_role
      ? ` — ${round.judged_role === "lead" ? "Leads" : "Follows"}`
      : ""
  }`;
  const showRoleToggle =
    scoringScope === "both" && siblingRound && round.judged_role != null;
  const asQuery = asAssignment ? `?as=${asAssignment}` : "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:py-6">
      {showRoleToggle && (
        <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur">
          <div className="flex w-full rounded-lg border border-neutral-700 p-0.5">
            {(
              [
                {
                  role: "lead" as const,
                  label: "Leads",
                  id:
                    round.judged_role === "lead" ? roundId : siblingRound.id,
                },
                {
                  role: "follow" as const,
                  label: "Follows",
                  id:
                    round.judged_role === "follow" ? roundId : siblingRound.id,
                },
              ] as const
            ).map(({ role, label, id: targetId }) => {
              const active = round.judged_role === role;
              return (
                <button
                  key={role}
                  onClick={() => {
                    if (!active) router.push(`/judge/${targetId}${asQuery}`);
                  }}
                  className={
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition min-h-11 " +
                    (active
                      ? compBtnTabActive
                      : "border border-transparent text-neutral-400 hover:text-white")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4">
        <Link href="/judge" className="text-xs text-neutral-500 hover:text-primary">
          ← My rounds
        </Link>
        <h1 className="text-base font-bold leading-snug text-white sm:text-lg">{title}</h1>
        {asAssignment && (
          <p className="text-xs text-amber-400">
            Entering scores on a judge&apos;s behalf (admin)
          </p>
        )}
      </div>

      {round.status === "checkin" && (
        <div
          className={
            "rounded-xl border p-6 text-center " +
            (context.checkin?.complete
              ? "border-primary/40 bg-primary/10"
              : "border-amber-500/40 bg-amber-500/10")
          }
        >
          {context.checkin?.complete ? (
            <>
              <p className="font-medium text-primary">Check-in complete</p>
              <p className="mt-1 text-sm text-neutral-400">
                Waiting for the director to open scoring. Your sheet will
                appear here as soon as the floor opens.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-amber-300">Check-in in progress</p>
              <p className="mt-1 text-sm text-neutral-400">
                Your sheet will appear once every competitor is checked in and
                the director opens the floor.
              </p>
            </>
          )}
        </div>
      )}

      {["closed", "tabulated", "published"].includes(round.status) &&
        sheet.status !== "submitted" && (
          <div className="mb-3 rounded-md border border-neutral-600 bg-neutral-800/60 p-3 text-sm text-neutral-300">
            Scoring is closed for this round.
          </div>
        )}

      {round.status !== "checkin" &&
        round.status !== "pending" &&
        entries.length > 0 &&
        (round.scoring_mode === "callback" ? (
          <CallbackSheet
            key={`${roundId}-${context.judgeAssignmentId}-${sheet.status}`}
            roundId={roundId}
            judgeAssignmentId={context.judgeAssignmentId}
            isOverride={!!asAssignment}
            callbackCount={round.callback_count ?? 0}
            alternateCount={round.alternate_count ?? 0}
            entries={entries}
            initialScores={scores}
            sheetStatus={round.status === "open" ? sheet.status : "submitted"}
            onSubmitted={load}
          />
        ) : (
          <FinalsSheet
            key={`${roundId}-${context.judgeAssignmentId}-${sheet.status}`}
            roundId={roundId}
            judgeAssignmentId={context.judgeAssignmentId}
            isOverride={!!asAssignment}
            entries={entries}
            initialScores={scores}
            sheetStatus={round.status === "open" ? sheet.status : "submitted"}
            onSubmitted={load}
          />
        ))}
    </div>
  );
}
