import { panelJudgesForRound } from "@/lib/comps/judgeScope";
import { activeRoundEntries, chiefJudge, panelJudges } from "@/lib/comps/roundData";
import type { RoundContext } from "@/lib/comps/roundData";
import { mapRoundEntriesToSlots } from "./entryMapping";
import { generateScores } from "./generators";
import {
  isCallbackEdgeCase,
  isOrdinalEdgeCase,
  lookupPlaybookEntry,
} from "./playbook";
import { submitCallbackScores, submitOrdinalScores } from "./scoreSubmission";

export interface AutoFillResult {
  autoFilled: boolean;
  playbookLabel?: string;
  playbookDescription?: string;
  judgeCount?: number;
  skippedReason?: string;
}

export async function autoFillTestRound(
  ctx: RoundContext
): Promise<AutoFillResult> {
  if (!ctx.competition.test_comp) {
    return { autoFilled: false, skippedReason: "not_test_comp" };
  }

  const hasScores = ctx.scores.some(
    (s) => s.callback_value != null || s.ordinal != null
  );
  if (hasScores) {
    return { autoFilled: false, skippedReason: "scores_exist" };
  }

  const playbook = lookupPlaybookEntry(
    ctx.competition.comp_type,
    ctx.round.round_type,
    ctx.round.judged_role
  );
  if (!playbook) {
    return { autoFilled: false, skippedReason: "no_playbook" };
  }

  const active = activeRoundEntries(ctx);
  if (active.length === 0) {
    return { autoFilled: false, skippedReason: "no_entries" };
  }

  const entrySlots = mapRoundEntriesToSlots(active);
  const panel = panelJudges(ctx);
  const panelIds = panel.map((j) => j.id);

  if (panelIds.length === 0) {
    return { autoFilled: false, skippedReason: "no_panel" };
  }

  const { edgeCase } = playbook;
  const generated = generateScores({
    edgeCase,
    callbackCount: ctx.round.callback_count ?? 1,
    alternateCount: ctx.round.alternate_count ?? 0,
    entryCount: active.length,
    judgeCount: panelIds.length,
    slots: entrySlots.slots,
  });

  if (isCallbackEdgeCase(edgeCase) && generated.judgeVotes) {
    const cj = chiefJudge(ctx);
    await submitCallbackScores(
      ctx.round.id,
      panelIds,
      generated.judgeVotes,
      entrySlots,
      cj?.id ?? null,
      generated.cjVotes
    );
  } else if (isOrdinalEdgeCase(edgeCase) && generated.judgeOrdinals) {
    const cj = chiefJudge(ctx);
    await submitOrdinalScores(
      ctx.round.id,
      panelIds,
      generated.judgeOrdinals,
      entrySlots,
      cj?.id ?? null,
      generated.cjOrdinals
    );
  } else {
    return { autoFilled: false, skippedReason: "generator_mismatch" };
  }

  return {
    autoFilled: true,
    playbookLabel: playbook.label,
    playbookDescription: playbook.description,
    judgeCount: panelIds.length,
  };
}

/** Panel judges that would score this round (for display / validation). */
export function panelJudgeIdsForRound(ctx: RoundContext): string[] {
  return panelJudgesForRound(
    ctx.judges,
    ctx.round,
    ctx.competition.cj_in_panel ?? false
  )
    .filter((j) => j.judge_role === "judge")
    .map((j) => j.id);
}
