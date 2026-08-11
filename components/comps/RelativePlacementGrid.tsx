"use client";

/**
 * Danceplace-style Relative Placement scoring grid, rendered entirely from a
 * stored tabulation snapshot (never recomputed live).
 */

import {
  JudgeColumnHeader,
  JudgeSheetLegend,
  cjColumnCellClass,
  panelScoresLayout,
} from "@/components/comps/JudgeSheetLegend";

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
  showJudgeDetail = true,
  highlightEntryIds,
}: {
  tabulation: RpTabulation;
  /** When false, show placements only (no per-judge ordinals or majority grid). */
  showJudgeDetail?: boolean;
  highlightEntryIds?: Set<string> | string[];
}) {
  const entryById = new Map(
    tabulation.entries.map((e) => [e.roundEntryId, e])
  );
  const highlight = highlightEntryIds
    ? new Set(
        highlightEntryIds instanceof Set
          ? highlightEntryIds
          : highlightEntryIds
      )
    : null;
  const levels = tabulation.grid[0]?.cells.length ?? 0;
  const bibKey = (roundEntryId: string) =>
    entryById.get(roundEntryId)?.bibNumber ?? Number.MAX_SAFE_INTEGER;
  const rows = [...tabulation.grid].sort((a, b) =>
    showJudgeDetail
      ? (a.placement ?? 999) - (b.placement ?? 999)
      : bibKey(a.roundEntryId) - bibKey(b.roundEntryId)
  );
  const { panelJudges, showPanelJudgeColumns, showTieBreakColumn, tieBreakInPanel } =
    panelScoresLayout(tabulation.judges, tabulation.chiefJudge, showJudgeDetail);
  const panelJudgeIndices = panelJudges.map((j) =>
    tabulation.judges.findIndex((p) => p.assignmentId === j.assignmentId)
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-left text-xs uppercase tracking-wide text-neutral-400">
            {showJudgeDetail && <th className="px-2 py-2">Place</th>}
            <th className="px-2 py-2">Bib</th>
            <th className="px-2 py-2">Competitors</th>
            {showPanelJudgeColumns &&
              panelJudges.map((j) => (
                <JudgeColumnHeader
                  key={j.assignmentId}
                  label={j.label}
                  name={j.name}
                />
              ))}
            {showTieBreakColumn && (
              <JudgeColumnHeader
                label="CJ"
                name={tabulation.chiefJudge!.name}
                muted
                separated
              />
            )}
            {showJudgeDetail &&
              Array.from({ length: levels }, (_, i) => (
                <th key={i} className="px-2 py-2 text-center">
                  {i === 0 ? "1st" : `1–${ordinalLabel(i + 1)}`}
                </th>
              ))}
            {showJudgeDetail && <th className="px-2 py-2">Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entry = entryById.get(row.roundEntryId);
            const highlighted = highlight?.has(row.roundEntryId);
            return (
              <tr
                key={row.roundEntryId}
                className={
                  "border-b border-neutral-800 hover:bg-neutral-800/50 " +
                  (highlighted ? "bg-amber-500/15" : "")
                }
              >
                {showJudgeDetail && (
                  <td className="px-2 py-2 font-semibold text-primary">
                    {row.placement != null ? ordinalLabel(row.placement) : "—"}
                  </td>
                )}
                <td className="px-2 py-2 font-mono">{entry?.bibNumber ?? "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">{entry?.displayName}</td>
                {showPanelJudgeColumns &&
                  panelJudgeIndices.map((idx, i) => (
                    <td key={i} className="px-2 py-2 text-center text-neutral-300">
                      {row.ordinals[idx]}
                    </td>
                  ))}
                {showTieBreakColumn && (
                  <td className={cjColumnCellClass}>
                    {row.chiefJudgeOrdinal ?? "—"}
                  </td>
                )}
                {showJudgeDetail &&
                  row.cells.map((cell, i) => {
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
                {showJudgeDetail && (
                  <td className="max-w-56 px-2 py-2 text-xs text-neutral-400">
                    {row.tieBreakNote}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {(showJudgeDetail || showTieBreakColumn || showPanelJudgeColumns) && (
        <JudgeSheetLegend
          judges={showJudgeDetail ? tabulation.judges : panelJudges}
          chiefJudge={tabulation.chiefJudge}
          cjOnly={!showJudgeDetail}
        />
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {showJudgeDetail ? (
          <>
            {tabulation.judges.length} panel judge
            {tabulation.judges.length === 1 ? "" : "s"}; majority{" "}
            {tabulation.majority}. Highlighted cell marks where each couple
            earned its placement.
            {showTieBreakColumn &&
              (tieBreakInPanel
                ? " CJ column also shows the chief judge's scores."
                : " CJ column is tie-break only.")}
          </>
        ) : showTieBreakColumn || showPanelJudgeColumns ? (
          tieBreakInPanel
            ? "Chief judge placements are shown in their panel column and the CJ column. Full panel scores will be posted once the competition is marked complete."
            : "Chief judge placements are shown. Full panel scores will be posted once the competition is marked complete."
        ) : (
          "Full judge scores will be posted once the competition is marked complete."
        )}
      </p>
    </div>
  );
}
