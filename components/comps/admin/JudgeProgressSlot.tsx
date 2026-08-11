"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import type {
  JudgeProgressRow,
  JudgeRoleProgress,
  SlotJudgeProgressResult,
} from "@/lib/comps/judgeProgress";
import type { RoundStatus, RoundType } from "@/lib/comps/types";

const SHOW_PROGRESS: RoundStatus[] = [
  "open",
  "closed",
  "tabulated",
];

interface SlotRoundRef {
  id: string;
  judged_role: string | null;
  status: RoundStatus;
}

function roleCell(prog: JudgeRoleProgress | null) {
  if (!prog) {
    return <span className="text-neutral-600">—</span>;
  }
  if (prog.sheetStatus === "none" && !["open", "closed", "tabulated"].includes(prog.roundStatus)) {
    return <span className="text-neutral-600">Not open</span>;
  }
  const done = prog.sheetStatus === "submitted";
  return (
    <span className={done ? "text-green-400" : "text-neutral-300"}>
      {prog.scored}/{prog.total}
      {done ? " ✓" : ""}
    </span>
  );
}

function aggregateLabel(status: JudgeProgressRow["aggregateStatus"]): string {
  if (status === "complete") return "Complete";
  if (status === "scoring") return "Scoring…";
  return "Waiting";
}

export default function JudgeProgressSlot({
  competitionId,
  roundType,
  slotRounds,
  cjInPanel,
  onChanged,
}: {
  competitionId: string;
  roundType: RoundType;
  slotRounds: SlotRoundRef[];
  cjInPanel: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<SlotJudgeProgressResult | null>(null);
  const [busy, setBusy] = useState(false);

  const shouldShow = slotRounds.some((r) => SHOW_PROGRESS.includes(r.status));

  const load = useCallback(async () => {
    if (!shouldShow) {
      setData(null);
      return;
    }
    const res = await authedFetch(
      `/api/admin/comps/${competitionId}/judge-progress?round_type=${roundType}`
    );
    if (!res.ok) return;
    setData((await res.json()) as SlotJudgeProgressResult);
  }, [competitionId, roundType, shouldShow]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!shouldShow || !slotRounds.some((r) => r.status === "open")) return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [shouldShow, slotRounds, load]);

  const unlockSheet = async (roundId: string, judgeAssignmentId: string) => {
    setBusy(true);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/sheets`, {
      method: "PATCH",
      body: JSON.stringify({ judge_assignment_id: judgeAssignmentId }),
    });
    setBusy(false);
    if (!res.ok) {
      return;
    }
    await load();
    onChanged();
  };

  const clearSheet = async (
    roundId: string,
    judgeAssignmentId: string,
    roleLabel: string
  ) => {
    if (
      !confirm(
        `Are you sure you want to clear this judge's ${roleLabel} scores? This action cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await authedFetch(`/api/admin/comps/rounds/${roundId}/sheets`, {
      method: "DELETE",
      body: JSON.stringify({ judge_assignment_id: judgeAssignmentId }),
    });
    setBusy(false);
    if (!res.ok) {
      return;
    }
    await load();
    onChanged();
  };

  const canClearRole = (prog: JudgeRoleProgress | null) =>
    prog != null &&
    !["tabulated", "published"].includes(prog.roundStatus) &&
    (prog.scored > 0 || prog.sheetStatus === "submitted");

  if (!shouldShow || !data) return null;

  const { summary, judges } = data;
  const hasLeads = slotRounds.some((r) => r.judged_role === "lead");
  const hasFollows = slotRounds.some((r) => r.judged_role === "follow");

  return (
    <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
      <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Judge progress
      </h4>
      <p className="mb-3 text-xs text-neutral-500">
        Slot-wide across Leads and Follows
        {hasLeads && (
          <>
            {" · "}
            Leads {summary.leadsPanelSubmitted}/{summary.leadsPanelTotal} panel
            submitted
          </>
        )}
        {hasFollows && (
          <>
            {" · "}
            Follows {summary.followsPanelSubmitted}/{summary.followsPanelTotal}{" "}
            panel submitted
          </>
        )}
        {!cjInPanel && (
          <>
            {" · "}
            CJ {summary.chiefJudgeComplete ? "✓" : "pending"}
          </>
        )}
        {summary.leadHeadJudgeLabel && (
          <>
            {" · "}
            HJ leads: {summary.leadHeadJudgeLabel}
          </>
        )}
        {summary.followHeadJudgeLabel && (
          <>
            {" · "}
            HJ follows: {summary.followHeadJudgeLabel}
          </>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-2 py-2">Judge</th>
              {hasLeads && <th className="px-2 py-2">Leads</th>}
              {hasFollows && <th className="px-2 py-2">Follows</th>}
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {judges.map((row) => (
              <tr
                key={row.assignmentId}
                className="border-b border-neutral-800"
              >
                <td className="px-2 py-2 text-white">
                  {row.firstName} {row.lastName}
                  {row.judgeRole === "chief_judge" && (
                    <span className="ml-1 text-xs text-primary">CJ</span>
                  )}
                  {row.tieBreakOnly && (
                    <span className="ml-1 text-xs text-neutral-500">
                      (tie-break only)
                    </span>
                  )}
                  {row.scopeLabel && (
                    <span className="ml-1 text-xs text-neutral-500">
                      ({row.scopeLabel})
                    </span>
                  )}
                  {row.isHeadJudgeLead && (
                    <span className="ml-1 text-xs text-primary">HJ leads</span>
                  )}
                  {row.isHeadJudgeFollow && (
                    <span className="ml-1 text-xs text-primary">HJ follows</span>
                  )}
                </td>
                {hasLeads && (
                  <td className="px-2 py-2 font-mono text-xs">
                    {roleCell(row.leads)}
                  </td>
                )}
                {hasFollows && (
                  <td className="px-2 py-2 font-mono text-xs">
                    {roleCell(row.follows)}
                  </td>
                )}
                <td className="px-2 py-2">
                  <span
                    className={
                      row.aggregateStatus === "complete"
                        ? "text-green-400"
                        : row.aggregateStatus === "scoring"
                          ? "text-neutral-300"
                          : "text-neutral-500"
                    }
                  >
                    {aggregateLabel(row.aggregateStatus)}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {row.leads &&
                      row.leads.roundStatus === "open" &&
                      row.leads.sheetStatus === "submitted" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            unlockSheet(row.leads!.roundId, row.assignmentId)
                          }
                          className="text-neutral-500 hover:text-amber-400 disabled:opacity-50"
                        >
                          Unlock L
                        </button>
                      )}
                    {canClearRole(row.leads) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          clearSheet(
                            row.leads!.roundId,
                            row.assignmentId,
                            "leads"
                          )
                        }
                        className="text-neutral-500 hover:text-red-400 disabled:opacity-50"
                      >
                        Clear L
                      </button>
                    )}
                    {row.follows &&
                      row.follows.roundStatus === "open" &&
                      row.follows.sheetStatus === "submitted" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            unlockSheet(row.follows!.roundId, row.assignmentId)
                          }
                          className="text-neutral-500 hover:text-amber-400 disabled:opacity-50"
                        >
                          Unlock F
                        </button>
                      )}
                    {canClearRole(row.follows) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          clearSheet(
                            row.follows!.roundId,
                            row.assignmentId,
                            "follows"
                          )
                        }
                        className="text-neutral-500 hover:text-red-400 disabled:opacity-50"
                      >
                        Clear F
                      </button>
                    )}
                    {row.leads?.roundStatus === "open" && (
                      <Link
                        href={`/judge/${row.leads.roundId}?as=${row.assignmentId}`}
                        className="text-neutral-500 hover:text-primary"
                      >
                        Enter L
                      </Link>
                    )}
                    {row.follows?.roundStatus === "open" && (
                      <Link
                        href={`/judge/${row.follows.roundId}?as=${row.assignmentId}`}
                        className="text-neutral-500 hover:text-primary"
                      >
                        Enter F
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
