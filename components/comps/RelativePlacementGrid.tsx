"use client";

/**
 * Danceplace-style Relative Placement scoring grid, rendered entirely from a
 * stored tabulation snapshot (never recomputed live).
 */

type Cell = { count: number; sum: number; majority: boolean };

export interface RpTabulation {
  mode: "relative_placement";
  judges: { assignmentId: string; label: string; name: string }[];
  chiefJudge: { assignmentId: string; label: string; name: string } | null;
  majority: number;
  entries: {
    roundEntryId: string;
    bibNumber: number | null;
    displayName: string;
  }[];
  grid: {
    roundEntryId: string;
    ordinals: number[];
    cells: Cell[];
    placement: number | null;
    decidedAtLevel: number | null;
    tieBreakNote: string | null;
    chiefJudgeOrdinal: number | null;
  }[];
}

function ordinalLabel(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

export default function RelativePlacementGrid({
  tabulation,
}: {
  tabulation: RpTabulation;
}) {
  const entryById = new Map(
    tabulation.entries.map((e) => [e.roundEntryId, e])
  );
  const levels = tabulation.grid[0]?.cells.length ?? 0;
  const rows = [...tabulation.grid].sort(
    (a, b) => (a.placement ?? 999) - (b.placement ?? 999)
  );
  const hasCj = tabulation.chiefJudge != null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wide text-neutral-400">
            <th className="px-2 py-2">Place</th>
            <th className="px-2 py-2">Bib</th>
            <th className="px-2 py-2">Competitors</th>
            {tabulation.judges.map((j) => (
              <th key={j.assignmentId} className="px-2 py-2 text-center" title={j.name}>
                {j.label}
              </th>
            ))}
            {hasCj && (
              <th
                className="px-2 py-2 text-center text-neutral-500"
                title={tabulation.chiefJudge!.name}
              >
                CJ
              </th>
            )}
            {Array.from({ length: levels }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center">
                {i === 0 ? "1st" : `1–${ordinalLabel(i + 1)}`}
              </th>
            ))}
            <th className="px-2 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entry = entryById.get(row.roundEntryId);
            return (
              <tr
                key={row.roundEntryId}
                className="border-b border-neutral-800 hover:bg-neutral-800/50"
              >
                <td className="px-2 py-2 font-semibold text-primary">
                  {row.placement != null ? ordinalLabel(row.placement) : "—"}
                </td>
                <td className="px-2 py-2 font-mono">{entry?.bibNumber ?? "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">{entry?.displayName}</td>
                {row.ordinals.map((ord, i) => (
                  <td key={i} className="px-2 py-2 text-center text-neutral-300">
                    {ord}
                  </td>
                ))}
                {hasCj && (
                  <td className="px-2 py-2 text-center text-neutral-500">
                    {row.chiefJudgeOrdinal ?? "—"}
                  </td>
                )}
                {row.cells.map((cell, i) => {
                  const level = i + 1;
                  const decided = row.decidedAtLevel === level;
                  const afterDecision =
                    row.decidedAtLevel != null && level > row.decidedAtLevel;
                  return (
                    <td
                      key={i}
                      className={
                        "px-2 py-2 text-center " +
                        (decided
                          ? "rounded bg-primary/20 font-bold text-primary"
                          : afterDecision
                            ? "text-neutral-600"
                            : cell.majority
                              ? "font-semibold text-neutral-200"
                              : "text-neutral-500")
                      }
                      title={
                        cell.majority
                          ? `${cell.count} judges (sum ${cell.sum})`
                          : undefined
                      }
                    >
                      {afterDecision ? "—" : cell.count > 0 ? (
                        decided && row.tieBreakNote ? `${cell.count} (${cell.sum})` : cell.count
                      ) : ""}
                    </td>
                  );
                })}
                <td className="max-w-56 px-2 py-2 text-xs text-neutral-400">
                  {row.tieBreakNote}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        {tabulation.judges.length} judges; majority {tabulation.majority}.
        Highlighted cell marks where each couple earned its placement.
        {hasCj && " CJ scores are tie-break only."}
      </p>
    </div>
  );
}
