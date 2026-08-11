import { judgeScoresRound, panelJudgesForRound } from "@/lib/comps/judgeScope";
import type { JudgeWithProfile, RoundContext } from "@/lib/comps/roundData";
import type { DanceRole, RoundStatus, RoundType, ScoringScope } from "@/lib/comps/types";

export interface JudgeRoleProgress {
  roundId: string;
  roundStatus: RoundStatus;
  isPanel: boolean;
  sheetStatus: "draft" | "submitted" | "none";
  scored: number;
  total: number;
}

export interface JudgeProgressRow {
  assignmentId: string;
  firstName: string;
  lastName: string;
  judgeRole: "judge" | "chief_judge";
  scoringScope: ScoringScope;
  dropsFinals: boolean;
  leads: JudgeRoleProgress | null;
  follows: JudgeRoleProgress | null;
  tieBreakOnly: boolean;
  aggregateStatus: JudgeAggregateStatus;
  scopeLabel: string | null;
}

export type JudgeAggregateStatus = "complete" | "scoring" | "waiting";

export interface SlotJudgeProgressResult {
  roundType: RoundType;
  leadsRoundId: string | null;
  followsRoundId: string | null;
  judges: JudgeProgressRow[];
  summary: SlotJudgeProgressSummary;
}

export interface SlotJudgeProgressSummary {
  leadsPanelSubmitted: number;
  leadsPanelTotal: number;
  followsPanelSubmitted: number;
  followsPanelTotal: number;
  chiefJudgeComplete: boolean;
}

const SCORING_PHASE: RoundStatus[] = ["open", "closed", "tabulated"];

function activeEntryCount(ctx: RoundContext): number {
  return ctx.roundEntries.filter(
    (re) => !re.scratched && re.checkin_status === "checked_in"
  ).length;
}

function scoreCountForJudge(ctx: RoundContext, judgeId: string): number {
  let count = 0;
  for (const score of ctx.scores) {
    if (
      score.judge_assignment_id === judgeId &&
      (score.callback_value != null || score.ordinal != null)
    ) {
      count++;
    }
  }
  return count;
}

function buildRoleProgress(
  judge: JudgeWithProfile,
  ctx: RoundContext | null,
  cjInPanel: boolean
): JudgeRoleProgress | null {
  if (!ctx) return null;
  const { round } = ctx;
  if (!judgeScoresRound(judge, round)) return null;

  const activeCount = activeEntryCount(ctx);
  const sheet = ctx.sheets.find((s) => s.judge_assignment_id === judge.id);

  let sheetStatus: JudgeRoleProgress["sheetStatus"];
  if (!SCORING_PHASE.includes(round.status)) {
    sheetStatus = "none";
  } else if (!sheet) {
    sheetStatus = "none";
  } else {
    sheetStatus = sheet.status === "submitted" ? "submitted" : "draft";
  }

  const isPanel =
    panelJudgesForRound([judge], round, cjInPanel).length > 0;

  return {
    roundId: round.id,
    roundStatus: round.status,
    isPanel,
    sheetStatus,
    scored: scoreCountForJudge(ctx, judge.id),
    total: activeCount,
  };
}

export function scopeLabelForJudge(judge: JudgeWithProfile): string | null {
  if (judge.judge_role === "chief_judge") return null;
  if (judge.scoring_scope === "lead") return "scores leads";
  if (judge.scoring_scope === "follow") return "scores follows";
  return null;
}

export function aggregateStatusForRow(
  leads: JudgeRoleProgress | null,
  follows: JudgeRoleProgress | null
): JudgeAggregateStatus {
  const applicable = [leads, follows].filter(
    (r): r is JudgeRoleProgress => r != null
  );
  if (applicable.length === 0) return "waiting";

  const needsSubmission = applicable.filter((r) =>
    ["open", "closed"].includes(r.roundStatus)
  );

  if (needsSubmission.length === 0) {
    const allDone = applicable.every(
      (r) =>
        r.sheetStatus === "submitted" ||
        r.roundStatus === "tabulated" ||
        r.roundStatus === "published"
    );
    return allDone ? "complete" : "waiting";
  }

  if (
    needsSubmission.every(
      (r) => r.sheetStatus === "submitted" || r.total === 0
    )
  ) {
    return "complete";
  }

  return "scoring";
}

function countPanelSubmitted(
  ctx: RoundContext | null,
  judges: JudgeWithProfile[],
  cjInPanel: boolean
): { submitted: number; total: number } {
  if (!ctx) return { submitted: 0, total: 0 };
  const panel = panelJudgesForRound(judges, ctx.round, cjInPanel).filter(
    (j) => j.judge_role === "judge"
  );
  if (panel.length === 0) return { submitted: 0, total: 0 };

  let submitted = 0;
  for (const j of panel) {
    const sheet = ctx.sheets.find((s) => s.judge_assignment_id === j.id);
    if (sheet?.status === "submitted") submitted++;
  }
  return { submitted, total: panel.length };
}

function chiefJudgeComplete(
  cj: JudgeWithProfile | undefined,
  leadCtx: RoundContext | null,
  followCtx: RoundContext | null,
  cjInPanel: boolean
): boolean {
  if (!cj) return true;
  const roles = [leadCtx, followCtx]
    .filter((ctx): ctx is RoundContext => ctx != null)
    .filter((ctx) => judgeScoresRound(cj, ctx.round));

  if (roles.length === 0) return true;

  return roles.every((ctx) => {
    if (!["open", "closed", "tabulated"].includes(ctx.round.status)) {
      return true;
    }
    const sheet = ctx.sheets.find((s) => s.judge_assignment_id === cj.id);
    if (cjInPanel) {
      return sheet?.status === "submitted";
    }
    return sheet?.status === "submitted";
  });
}

/** Build slot-wide judge progress for JnJ lead/follow callback rounds. */
export function buildSlotJudgeProgress(
  roundType: RoundType,
  judges: JudgeWithProfile[],
  leadCtx: RoundContext | null,
  followCtx: RoundContext | null,
  cjInPanel: boolean
): SlotJudgeProgressResult {
  const rows: JudgeProgressRow[] = judges.map((judge) => {
    const leads = buildRoleProgress(judge, leadCtx, cjInPanel);
    const follows = buildRoleProgress(judge, followCtx, cjInPanel);
    return {
      assignmentId: judge.id,
      firstName: judge.first_name,
      lastName: judge.last_name,
      judgeRole: judge.judge_role,
      scoringScope: judge.scoring_scope,
      dropsFinals: judge.drops_finals,
      leads,
      follows,
      tieBreakOnly: judge.judge_role === "chief_judge" && !cjInPanel,
      aggregateStatus: aggregateStatusForRow(leads, follows),
      scopeLabel: scopeLabelForJudge(judge),
    };
  });

  const leadPanel = countPanelSubmitted(leadCtx, judges, cjInPanel);
  const followPanel = countPanelSubmitted(followCtx, judges, cjInPanel);
  const cj = judges.find((j) => j.judge_role === "chief_judge");

  return {
    roundType,
    leadsRoundId: leadCtx?.round.id ?? null,
    followsRoundId: followCtx?.round.id ?? null,
    judges: rows,
    summary: {
      leadsPanelSubmitted: leadPanel.submitted,
      leadsPanelTotal: leadPanel.total,
      followsPanelSubmitted: followPanel.submitted,
      followsPanelTotal: followPanel.total,
      chiefJudgeComplete: chiefJudgeComplete(cj, leadCtx, followCtx, cjInPanel),
    },
  };
}

export function pickRoundContextForRole(
  role: DanceRole,
  leadCtx: RoundContext | null,
  followCtx: RoundContext | null
): RoundContext | null {
  return role === "lead" ? leadCtx : followCtx;
}
