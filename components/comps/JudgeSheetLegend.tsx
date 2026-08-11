export interface JudgeSheetLabel {
  assignmentId: string;
  label: string;
  name: string;
}

/** Visual separator for the tie-break chief judge column. */
export const cjColumnHeaderClass =
  "border-l-2 border-r-2 border-neutral-600 bg-neutral-900/50 px-3";
export const cjColumnCellClass =
  "border-l-2 border-r-2 border-neutral-600 bg-neutral-900/30 px-2 py-2 text-center text-neutral-400";

export function panelScoresLayout(
  judges: JudgeSheetLabel[],
  chiefJudge: JudgeSheetLabel | null | undefined,
  showAllPanelScores: boolean
): {
  panelJudges: JudgeSheetLabel[];
  showPanelJudgeColumns: boolean;
  showCjColumn: boolean;
  cjInPanel: boolean;
} {
  const cjInPanel =
    chiefJudge != null &&
    judges.some((j) => j.assignmentId === chiefJudge.assignmentId);
  const showCjColumn = chiefJudge != null;

  let panelJudges: JudgeSheetLabel[];
  if (showAllPanelScores) {
    panelJudges = judges;
  } else if (cjInPanel && chiefJudge) {
    panelJudges = judges.filter((j) => j.assignmentId === chiefJudge.assignmentId);
  } else {
    panelJudges = [];
  }

  const showPanelJudgeColumns =
    showAllPanelScores || (cjInPanel && panelJudges.length > 0);

  return { panelJudges, showPanelJudgeColumns, showCjColumn, cjInPanel };
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
  chiefJudge,
  cjOnly = false,
}: {
  judges: JudgeSheetLabel[];
  chiefJudge?: JudgeSheetLabel | null;
  /** When true, panel scores are hidden (tie-break CJ or in-panel CJ only). */
  cjOnly?: boolean;
}) {
  const cjInPanel =
    chiefJudge != null &&
    judges.some((j) => j.assignmentId === chiefJudge.assignmentId);
  const showCjSection = chiefJudge != null;
  const showPanelJudges = judges.length > 0 && (!cjOnly || cjInPanel);

  if (!showPanelJudges && !showCjSection) return null;

  return (
    <div className="mt-3 border-t border-neutral-800 pt-2">
      {showPanelJudges && (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            Panel judges
          </p>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
            {judges.map((j) => (
              <span key={j.assignmentId}>
                <span className="font-mono text-neutral-500">{j.label}</span>{" "}
                {j.name}
                {chiefJudge?.assignmentId === j.assignmentId && (
                  <span className="ml-1 text-neutral-600">(CJ)</span>
                )}
              </span>
            ))}
          </div>
        </>
      )}
      {showCjSection && (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            Chief judge
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-x-2 border-neutral-600 px-3 text-xs text-neutral-400">
            <span>
              <span className="font-mono text-neutral-500">{chiefJudge!.label}</span>{" "}
              {chiefJudge!.name}
              {!cjInPanel && (
                <span className="ml-1 text-neutral-600">(tie-break only)</span>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
