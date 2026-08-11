export interface JudgeSheetLabel {
  assignmentId: string;
  label: string;
  name: string;
}

export interface TieBreakColumnLabel extends JudgeSheetLabel {
  kind?: "head_judge" | "chief_judge";
  displayLabel?: string;
}

/** Visual separator for tie-break judge columns. */
export const cjColumnHeaderClass =
  "border-l-2 border-r-2 border-neutral-600 bg-neutral-900/50 px-3";
export const cjColumnCellClass =
  "border-l-2 border-r-2 border-neutral-600 bg-neutral-900/30 px-2 py-2 text-center text-neutral-400";

export function resolveTieBreakJudge(
  tieBreakJudge?: TieBreakColumnLabel | null,
  chiefJudge?: JudgeSheetLabel | null
): TieBreakColumnLabel | null {
  if (tieBreakJudge) return tieBreakJudge;
  if (chiefJudge) {
    return { ...chiefJudge, kind: "chief_judge", displayLabel: "CJ" };
  }
  return null;
}

export function panelScoresLayout(
  judges: JudgeSheetLabel[],
  tieBreakJudge: TieBreakColumnLabel | null | undefined,
  showAllPanelScores: boolean
): {
  panelJudges: JudgeSheetLabel[];
  showPanelJudgeColumns: boolean;
  showTieBreakColumn: boolean;
  tieBreakInPanel: boolean;
} {
  const tieBreak = tieBreakJudge ?? null;
  const tieBreakInPanel =
    tieBreak != null &&
    judges.some((j) => j.assignmentId === tieBreak.assignmentId);
  const showTieBreakColumn = tieBreak != null;

  let panelJudges: JudgeSheetLabel[];
  if (showAllPanelScores) {
    panelJudges = judges;
  } else if (tieBreakInPanel && tieBreak) {
    panelJudges = judges.filter((j) => j.assignmentId === tieBreak.assignmentId);
  } else if (showTieBreakColumn && tieBreak) {
    panelJudges = [tieBreak];
  } else {
    panelJudges = [];
  }

  const showPanelJudgeColumns =
    showAllPanelScores || panelJudges.length > 0;

  return {
    panelJudges,
    showPanelJudgeColumns,
    showTieBreakColumn,
    tieBreakInPanel,
  };
}

export function JudgeColumnHeader({
  label,
  name,
  muted = false,
  separated = false,
}: {
  label: string;
  name: string;
  muted?: boolean;
  separated?: boolean;
}) {
  return (
    <th
      className={
        "px-2 py-2 text-center " +
        (muted ? "text-neutral-500 " : "") +
        (separated ? cjColumnHeaderClass : "")
      }
      title={name}
    >
      <div>{label}</div>
      <div className="text-[10px] font-normal normal-case leading-tight text-neutral-500">
        {name}
      </div>
    </th>
  );
}

export function JudgeSheetLegend({
  judges,
  tieBreakJudge,
  chiefJudge,
  fallbackChiefJudge,
  cjOnly = false,
}: {
  judges: JudgeSheetLabel[];
  tieBreakJudge?: TieBreakColumnLabel | null;
  chiefJudge?: JudgeSheetLabel | null;
  fallbackChiefJudge?: JudgeSheetLabel | null;
  cjOnly?: boolean;
}) {
  const tieBreak = resolveTieBreakJudge(tieBreakJudge, chiefJudge);
  const tieBreakInPanel =
    tieBreak != null &&
    judges.some((j) => j.assignmentId === tieBreak.assignmentId);
  const showPanelJudges = judges.length > 0 && (!cjOnly || tieBreakInPanel);

  if (!showPanelJudges && !tieBreak) return null;

  const isHeadJudge = tieBreak?.kind === "head_judge";
  const tieBreakSectionLabel = isHeadJudge ? "Head judge" : "Chief judge";
  const tieBreakDisplay =
    tieBreak?.displayLabel ??
    (isHeadJudge ? `HJ: ${tieBreak?.label}` : tieBreak?.label ?? "CJ");

  return (
    <div className="mt-3 border-t border-neutral-800 pt-2">
      {showPanelJudges && (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            Panel judges
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-neutral-400">
            {judges.map((j, i) => (
              <span key={j.assignmentId} className="inline-flex items-center">
                {i > 0 && <span className="mx-1 text-neutral-700">·</span>}
                <span>
                  <span className="font-mono text-neutral-500">{j.label}</span>{" "}
                  {j.name}
                  {j.label === "CJ" && (
                    <span className="ml-1 text-neutral-600">(CJ)</span>
                  )}
                </span>
              </span>
            ))}
            {tieBreak && (
              <>
                <span className="mx-1 text-neutral-600">|</span>
                <span className="border-x border-neutral-600 px-2">
                  <span className="font-mono text-neutral-500">{tieBreakDisplay}</span>{" "}
                  {tieBreak.name}
                </span>
              </>
            )}
          </div>
        </>
      )}
      {tieBreak && !showPanelJudges && (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            {tieBreakSectionLabel}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-x-2 border-neutral-600 px-3 text-xs text-neutral-400">
            <span>
              <span className="font-mono text-neutral-500">{tieBreakDisplay}</span>{" "}
              {tieBreak.name}
              {!tieBreakInPanel && !isHeadJudge && (
                <span className="ml-1 text-neutral-600">(tie-break only)</span>
              )}
            </span>
          </div>
        </>
      )}
      {isHeadJudge && fallbackChiefJudge && (
        <p className="mt-1.5 text-xs text-neutral-500">
          CJ {fallbackChiefJudge.name} — fallback tie-break
        </p>
      )}
    </div>
  );
}
