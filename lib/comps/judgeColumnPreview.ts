import { judgeScoresRound, panelJudgesForRound } from "@/lib/comps/judgeScope";
import type { JudgeWithProfile } from "@/lib/comps/roundData";
import type { CompRoundRow, CompType, DanceRole } from "@/lib/comps/types";

export type ColumnPreviewContext =
  | { kind: "jnj_callback"; role: DanceRole }
  | { kind: "jnj_final" }
  | { kind: "strictly_callback" }
  | { kind: "strictly_final" };

export interface JudgeColumnPreview {
  context: ColumnPreviewContext;
  title: string;
  panelColumns: { label: string; name: string; assignmentId: string; isCj?: boolean }[];
  tieBreakColumn: {
    label: string;
    name: string;
    kind: "head_judge" | "chief_judge";
  } | null;
  fallbackNote: string | null;
  scoringJudges: { name: string; note: string }[];
  warnings: string[];
}

function personName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown";
}

function mockCallbackRound(role: DanceRole | null): Pick<
  CompRoundRow,
  "round_type" | "judged_role" | "scoring_mode"
> {
  return {
    round_type: "prelims",
    judged_role: role,
    scoring_mode: "callback",
  };
}

function mockFinalsRound(): Pick<
  CompRoundRow,
  "round_type" | "judged_role" | "scoring_mode"
> {
  return {
    round_type: "final",
    judged_role: null,
    scoring_mode: "relative_placement",
  };
}

function buildCallbackPreview(
  title: string,
  context: ColumnPreviewContext,
  judges: JudgeWithProfile[],
  cjInPanel: boolean,
  headJudgeId: string | null
): JudgeColumnPreview {
  const role =
    context.kind === "jnj_callback" ? context.role : null;
  const round = mockCallbackRound(role);
  const panel = panelJudgesForRound(judges, round, cjInPanel);
  const panelColumns = fixPanelLabels(panel);
  const cj = judges.find((j) => j.judge_role === "chief_judge");
  const warnings: string[] = [];

  if (panel.length === 0) warnings.push("No panel judges for this round");
  else if (panel.length % 2 === 0) {
    warnings.push(`Even panel (${panel.length}) — tie-breaks more likely`);
  }

  const hj = headJudgeId ? judges.find((j) => j.id === headJudgeId) : null;
  let tieBreakColumn: JudgeColumnPreview["tieBreakColumn"] = null;
  let fallbackNote: string | null = null;

  if (hj && panel.some((j) => j.id === hj.id)) {
    const hjCol = panelColumns.find((c) => c.assignmentId === hj.id);
    tieBreakColumn = {
      label: hjCol ? `HJ: ${hjCol.label}` : "HJ",
      name: personName(hj.first_name, hj.last_name),
      kind: "head_judge",
    };
    if (cj) {
      fallbackNote = `CJ ${personName(cj.first_name, cj.last_name)} — fallback tie-break`;
    }
  } else if (cj && !cjInPanel) {
    tieBreakColumn = {
      label: "CJ",
      name: personName(cj.first_name, cj.last_name),
      kind: "chief_judge",
    };
    if (headJudgeId && !hj) {
      warnings.push("Designated head judge is not on the panel for this role");
    }
  } else if (!cj) {
    warnings.push("No chief judge assigned");
  }

  const scoringJudges: { name: string; note: string }[] = [];
  if (cj && !cjInPanel && judgeScoresRound(cj, round)) {
    scoringJudges.push({
      name: personName(cj.first_name, cj.last_name),
      note: "Scores sheet; tie-break only (not in panel)",
    });
  }

  return {
    context,
    title,
    panelColumns,
    tieBreakColumn,
    fallbackNote,
    scoringJudges,
    warnings,
  };
}

function buildJnJCallbackPreview(
  role: DanceRole,
  judges: JudgeWithProfile[],
  cjInPanel: boolean,
  headJudgeId: string | null
): JudgeColumnPreview {
  return buildCallbackPreview(
    role === "lead" ? "Callback — Leads" : "Callback — Follows",
    { kind: "jnj_callback", role },
    judges,
    cjInPanel,
    headJudgeId
  );
}

function fixPanelLabels(
  panel: JudgeWithProfile[]
): { label: string; name: string; assignmentId: string; isCj?: boolean }[] {
  let jNum = 0;
  return panel.map((j) => {
    if (j.judge_role === "chief_judge") {
      return {
        assignmentId: j.id,
        label: "CJ",
        name: personName(j.first_name, j.last_name),
        isCj: true,
      };
    }
    jNum++;
    return {
      assignmentId: j.id,
      label: `J${jNum}`,
      name: personName(j.first_name, j.last_name),
    };
  });
}

function buildFinalsPreview(
  title: string,
  context: ColumnPreviewContext,
  judges: JudgeWithProfile[],
  cjInPanel: boolean
): JudgeColumnPreview {
  const round = mockFinalsRound();
  const panel = panelJudgesForRound(judges, round, cjInPanel);
  const panelColumns = fixPanelLabels(panel);
  const cj = judges.find((j) => j.judge_role === "chief_judge");
  const warnings: string[] = [];

  if (panel.length === 0) warnings.push("No judges score finals");
  else if (panel.length % 2 === 0) {
    warnings.push(`Even finals panel (${panel.length})`);
  }

  const tieBreakColumn =
    cj && !cjInPanel
      ? {
          label: "CJ",
          name: personName(cj.first_name, cj.last_name),
          kind: "chief_judge" as const,
        }
      : null;

  const scoringJudges: { name: string; note: string }[] = [];
  if (cj && !cjInPanel) {
    scoringJudges.push({
      name: personName(cj.first_name, cj.last_name),
      note: "Tie-break only",
    });
  }

  return {
    context,
    title,
    panelColumns,
    tieBreakColumn,
    fallbackNote: null,
    scoringJudges,
    warnings,
  };
}

export function buildJudgeColumnPreviews(input: {
  compType: CompType;
  judges: JudgeWithProfile[];
  cjInPanel: boolean;
  leadHeadJudgeId: string | null;
  followHeadJudgeId: string | null;
}): JudgeColumnPreview[] {
  const { compType, judges, cjInPanel, leadHeadJudgeId, followHeadJudgeId } =
    input;

  if (compType === "jack_and_jill") {
    return [
      buildJnJCallbackPreview("lead", judges, cjInPanel, leadHeadJudgeId),
      buildJnJCallbackPreview("follow", judges, cjInPanel, followHeadJudgeId),
      buildFinalsPreview("Finals (couples)", { kind: "jnj_final" }, judges, cjInPanel),
    ];
  }

  return [
    buildCallbackPreview(
      "Callback",
      { kind: "strictly_callback" },
      judges,
      cjInPanel,
      null
    ),
    buildFinalsPreview("Finals", { kind: "strictly_final" }, judges, cjInPanel),
  ];
}
