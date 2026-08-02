"use client";

/** Callback (Yes/Alt/No) round results rendered from a tabulation snapshot. */

export interface CallbackTabulation {
  mode: "callback";
  judges: { assignmentId: string; label: string; name: string }[];
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
    votes: string[];
  }[];
}

const VOTE_LABEL: Record<string, string> = {
  yes: "Y",
  alt1: "A1",
  alt2: "A2",
  alt3: "A3",
  no: "–",
};

export default function CallbackResultsTable({
  tabulation,
  showVotes = true,
}: {
  tabulation: CallbackTabulation;
  showVotes?: boolean;
}) {
  const entryById = new Map(tabulation.entries.map((e) => [e.roundEntryId, e]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wide text-neutral-400">
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">Bib</th>
            <th className="px-2 py-2">Competitor</th>
            {showVotes &&
              tabulation.judges.map((j) => (
                <th key={j.assignmentId} className="px-2 py-2 text-center" title={j.name}>
                  {j.label}
                </th>
              ))}
            <th className="px-2 py-2 text-right">Points</th>
            <th className="px-2 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {tabulation.ranked.map((row) => {
            const entry = entryById.get(row.roundEntryId);
            return (
              <tr
                key={row.roundEntryId}
                className={
                  "border-b border-neutral-800 " +
                  (row.advanced ? "bg-primary/5" : "")
                }
              >
                <td className="px-2 py-2 text-neutral-400">{row.rank}</td>
                <td className="px-2 py-2 font-mono">{entry?.bibNumber ?? "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">{entry?.displayName}</td>
                {showVotes &&
                  row.votes.map((v, i) => (
                    <td
                      key={i}
                      className={
                        "px-2 py-2 text-center " +
                        (v === "yes"
                          ? "font-semibold text-primary"
                          : v.startsWith("alt")
                            ? "text-amber-400"
                            : "text-neutral-600")
                      }
                    >
                      {VOTE_LABEL[v] ?? v}
                    </td>
                  ))}
                <td className="px-2 py-2 text-right font-mono">{row.points}</td>
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
        Top {tabulation.callbackCount} advance
        {tabulation.alternateCount > 0 &&
          `, ${tabulation.alternateCount} ranked alternate${tabulation.alternateCount === 1 ? "" : "s"}`}
        . Y = 10, A1 = 4.5, A2 = 4.3, A3 = 4.2 points. * = coordinator/CJ decision.
      </p>
    </div>
  );
}
