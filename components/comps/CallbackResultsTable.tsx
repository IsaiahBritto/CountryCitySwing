"use client";

/** Callback (Yes/Alt/No) round results rendered from a tabulation snapshot. */

import { orderCallbackRowsForDisplay } from "@/lib/comps/callbackDisplayOrder";

export interface CallbackTabulation {
  mode: "callback";
  judges: { assignmentId: string; label: string; name: string }[];
  chiefJudge?: { assignmentId: string; label: string; name: string } | null;
  callbackCount: number;
  alternateCount: number;
  entries: {
    roundEntryId: string;
    bibNumber: number | null;
    displayName: string;
  }[];
  ranked: {
    roundEntryId: string;
    points: number;
    rank: number;
    advanced: boolean;
    alternateRank: number | null;
    resolvedByDecision: boolean;
    resolvedByChiefJudge?: boolean;
    tieBreakNote?: string | null;
    votes: string[];
    chiefJudgeVote?: string | null;
  }[];
}

const VOTE_LABEL: Record<string, string> = {
  yes: "Y",
  alt1: "A1",
  alt2: "A2",
  alt3: "A3",
  no: "–",
};

function voteCellClass(v: string): string {
  if (v === "yes") return "font-semibold text-primary";
  if (v.startsWith("alt")) return "text-amber-400";
  return "text-neutral-600";
}

export default function CallbackResultsTable({
  tabulation,
  showVotes = true,
  highlightEntryIds,
}: {
  tabulation: CallbackTabulation;
  showVotes?: boolean;
  highlightEntryIds?: Set<string> | string[];
}) {
  const entryById = new Map(tabulation.entries.map((e) => [e.roundEntryId, e]));
  const highlight = highlightEntryIds
    ? new Set(
        highlightEntryIds instanceof Set
          ? highlightEntryIds
          : highlightEntryIds
      )
    : null;
  const rows = orderCallbackRowsForDisplay(
    tabulation.ranked,
    tabulation.entries,
    showVotes
  );
  const advanceCut = tabulation.callbackCount;
  const alternateCut = tabulation.callbackCount + tabulation.alternateCount;
  const cjInPanel =
    tabulation.chiefJudge != null &&
    tabulation.judges.some(
      (j) => j.assignmentId === tabulation.chiefJudge!.assignmentId
    );
  const showCjColumn =
    showVotes && tabulation.chiefJudge != null && !cjInPanel;
  const hasCjTieBreak = tabulation.ranked.some((r) => r.resolvedByChiefJudge);
  const hasManualDecision = tabulation.ranked.some((r) => r.resolvedByDecision);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wide text-neutral-400">
            {showVotes && <th className="px-2 py-2">#</th>}
            <th className="px-2 py-2">Bib</th>
            <th className="px-2 py-2">Competitor</th>
            {showVotes &&
              tabulation.judges.map((j) => (
                <th key={j.assignmentId} className="px-2 py-2 text-center" title={j.name}>
                  {j.label}
                </th>
              ))}
            {showCjColumn && (
              <th
                className="px-2 py-2 text-center"
                title={tabulation.chiefJudge!.name}
              >
                {tabulation.chiefJudge!.label}
              </th>
            )}
            {showVotes && (
              <th className="px-2 py-2 text-right">Points</th>
            )}
            <th className="px-2 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entry = entryById.get(row.roundEntryId);
            const highlighted = highlight?.has(row.roundEntryId);
            const isAdvanceCut = showVotes && row.rank === advanceCut;
            const isAlternateCut =
              showVotes &&
              tabulation.alternateCount > 0 &&
              row.rank === alternateCut;
            const cjVote = row.chiefJudgeVote ?? "no";
            return (
              <tr
                key={row.roundEntryId}
                className={
                  "border-b border-neutral-800 " +
                  (highlighted
                    ? "bg-amber-500/15"
                    : row.advanced
                      ? "bg-primary/5"
                      : "") +
                  (isAdvanceCut ? " border-b-2 border-primary/60" : "") +
                  (isAlternateCut ? " border-b-2 border-amber-500/60" : "")
                }
              >
                {showVotes && (
                  <td className="px-2 py-2 text-neutral-400">{row.rank}</td>
                )}
                <td className="px-2 py-2 font-mono">{entry?.bibNumber ?? "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">{entry?.displayName}</td>
                {showVotes &&
                  row.votes.map((v, i) => (
                    <td
                      key={i}
                      className={"px-2 py-2 text-center " + voteCellClass(v)}
                    >
                      {VOTE_LABEL[v] ?? v}
                    </td>
                  ))}
                {showCjColumn && (
                  <td
                    className={
                      "px-2 py-2 text-center " +
                      voteCellClass(cjVote) +
                      (highlighted ? " ring-1 ring-inset ring-amber-400/50" : "")
                    }
                  >
                    {VOTE_LABEL[cjVote] ?? cjVote}
                  </td>
                )}
                {showVotes && (
                  <td className="px-2 py-2 text-right font-mono">{row.points}</td>
                )}
                <td className="px-2 py-2">
                  {row.advanced ? (
                    <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                      Advances
                    </span>
                  ) : row.alternateRank != null ? (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                      Alt {row.alternateRank}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-500">—</span>
                  )}
                  {row.resolvedByChiefJudge && (
                    <span
                      className="ml-1 text-xs text-neutral-500"
                      title={row.tieBreakNote ?? "Tie broken by chief judge's vote"}
                    >
                      †
                    </span>
                  )}
                  {row.resolvedByDecision && (
                    <span
                      className="ml-1 text-xs text-neutral-500"
                      title="Boundary tie resolved by coordinator/chief judge decision"
                    >
                      *
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        {showVotes ? (
          <>
            Top {tabulation.callbackCount} advance
            {tabulation.alternateCount > 0 &&
              `, ${tabulation.alternateCount} ranked alternate${tabulation.alternateCount === 1 ? "" : "s"}`}
            . Y = 10, A1 = 4.5, A2 = 4.3, A3 = 4.2 points.
            {showCjColumn && " CJ column is tie-break only."}
            {hasCjTieBreak && " † = tie broken by chief judge's vote."}
            {hasManualDecision && " * = coordinator/CJ manual decision."}
          </>
        ) : (
          <>
            Top {tabulation.callbackCount} advance
            {tabulation.alternateCount > 0 &&
              `, ${tabulation.alternateCount} ranked alternate${tabulation.alternateCount === 1 ? "" : "s"}`}
            . Full judge scores will be posted once the competition is marked complete.
          </>
        )}
      </p>
    </div>
  );
}
