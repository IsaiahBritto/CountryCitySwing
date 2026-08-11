"use client";

import {
  cjColumnHeaderClass,
  cjColumnCellClass,
} from "@/components/comps/JudgeSheetLegend";
import type { JudgeColumnPreview } from "@/lib/comps/judgeColumnPreview";

export default function JudgeColumnPreviewCard({
  previews,
}: {
  previews: JudgeColumnPreview[];
}) {
  if (previews.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
      <h3 className="mb-1 font-semibold text-white">Score sheet preview</h3>
      <p className="mb-4 text-xs text-neutral-500">
        How results columns will appear for each round type with the current
        judge configuration.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {previews.map((preview) => (
          <div
            key={preview.title}
            className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3"
          >
            <h4 className="mb-2 text-sm font-medium text-neutral-200">
              {preview.title}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-700 text-neutral-500">
                    <th className="px-2 py-1.5 text-left">Bib</th>
                    <th className="px-2 py-1.5 text-left">Competitor</th>
                    {preview.panelColumns.map((col) => (
                      <th key={col.assignmentId} className="px-2 py-1.5 text-center">
                        <div className="font-mono">{col.label}</div>
                        <div className="text-[10px] font-normal text-neutral-600">
                          {col.name.split(" ")[0]}
                        </div>
                      </th>
                    ))}
                    {preview.tieBreakColumn && (
                      <th
                        className={
                          "px-2 py-1.5 text-center " + cjColumnHeaderClass
                        }
                      >
                        <div className="font-mono">
                          {preview.tieBreakColumn.label}
                        </div>
                        <div className="text-[10px] font-normal text-neutral-600">
                          {preview.tieBreakColumn.name.split(" ")[0]}
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-neutral-600">
                    <td className="px-2 py-1.5">—</td>
                    <td className="px-2 py-1.5">—</td>
                    {preview.panelColumns.map((col) => (
                      <td key={col.assignmentId} className="px-2 py-1.5 text-center">
                        —
                      </td>
                    ))}
                    {preview.tieBreakColumn && (
                      <td className={cjColumnCellClass + " text-neutral-600"}>
                        —
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            {preview.panelColumns.length > 0 && (
              <p className="mt-2 text-[11px] text-neutral-500">
                Panel:{" "}
                {preview.panelColumns
                  .map((c) => `${c.label} ${c.name}`)
                  .join(" · ")}
              </p>
            )}
            {preview.tieBreakColumn && (
              <p className="mt-1 text-[11px] text-neutral-500">
                Tie-break: {preview.tieBreakColumn.label}{" "}
                {preview.tieBreakColumn.name}
                {preview.tieBreakColumn.kind === "head_judge" ? " (primary)" : ""}
              </p>
            )}
            {preview.fallbackNote && (
              <p className="mt-0.5 text-[11px] text-neutral-600">
                {preview.fallbackNote}
              </p>
            )}
            {preview.scoringJudges.map((s) => (
              <p key={s.name} className="mt-0.5 text-[11px] text-neutral-600">
                {s.name} — {s.note}
              </p>
            ))}
            {preview.warnings.map((w) => (
              <p
                key={w}
                className="mt-1 text-[11px] text-amber-400/90"
              >
                {w}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
