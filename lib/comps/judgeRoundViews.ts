import type { JudgeRoundViewPayload } from "@/lib/comps/judgeRoundPayload";
import type { DanceRole } from "@/lib/comps/types";

export interface JudgeRoundApiResponse extends JudgeRoundViewPayload {
  competition: {
    id: string;
    name: string;
    comp_type: string;
  };
  judgeAssignmentId: string;
  judgeRole: string;
  scoringScope: string;
  siblingRound: { id: string; judged_role: DanceRole } | null;
  siblingContext: JudgeRoundViewPayload | null;
}

export interface JudgeRoundBundle {
  competition: JudgeRoundApiResponse["competition"];
  judgeAssignmentId: string;
  scoringScope: string;
  siblingRound: JudgeRoundApiResponse["siblingRound"];
  leadView: JudgeRoundViewPayload | null;
  followView: JudgeRoundViewPayload | null;
  /** Single-role view when lead/follow split does not apply. */
  singleView: JudgeRoundViewPayload | null;
}

export function parseJudgeRoundBundle(
  data: JudgeRoundApiResponse,
  urlRoundId: string
): { bundle: JudgeRoundBundle; activeRole: DanceRole } {
  const primary: JudgeRoundViewPayload = {
    round: data.round,
    checkin: data.checkin,
    sheet: data.sheet,
    entries: data.entries,
    scores: data.scores,
  };

  const shared = {
    competition: data.competition,
    judgeAssignmentId: data.judgeAssignmentId,
    scoringScope: data.scoringScope,
    siblingRound: data.siblingRound,
  };

  const role = data.round.judged_role;
  if (role === "lead" || role === "follow") {
    const leadView = role === "lead" ? primary : data.siblingContext;
    const followView = role === "follow" ? primary : data.siblingContext;
    const activeRole: DanceRole =
      urlRoundId === followView?.round.id ? "follow" : "lead";
    return {
      bundle: { ...shared, leadView: leadView ?? null, followView: followView ?? null, singleView: null },
      activeRole,
    };
  }

  return {
    bundle: {
      ...shared,
      leadView: null,
      followView: null,
      singleView: primary,
    },
    activeRole: "lead",
  };
}

export function activeJudgeRoundView(
  bundle: JudgeRoundBundle,
  activeRole: DanceRole
): JudgeRoundViewPayload | null {
  if (bundle.singleView) return bundle.singleView;
  return activeRole === "lead" ? bundle.leadView : bundle.followView;
}

export function showJudgeRoleToggle(bundle: JudgeRoundBundle): boolean {
  return (
    bundle.scoringScope === "both" &&
    bundle.leadView != null &&
    bundle.followView != null
  );
}

export function bundleNeedsCheckinPoll(bundle: JudgeRoundBundle): boolean {
  const views = [bundle.singleView, bundle.leadView, bundle.followView].filter(
    Boolean
  ) as JudgeRoundViewPayload[];
  return views.some((v) => v.round.status === "checkin");
}
