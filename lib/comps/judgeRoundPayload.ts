import {
  activeRoundEntries,
  entryDisplay,
  loadRoundContext,
  RoundDataError,
  type JudgeWithProfile,
} from "@/lib/comps/roundData";
import { judgeScoresRound } from "@/lib/comps/judgeScope";
import { supabaseServer } from "@/lib/supabaseServer";

export interface JudgeRoundViewPayload {
  round: {
    id: string;
    competition_id: string;
    round_type: string;
    judged_role: string | null;
    scoring_mode: string;
    callback_count: number | null;
    alternate_count: number | null;
    status: string;
  };
  checkin: {
    unresolved: number;
    present: number;
    complete: boolean;
  };
  sheet: {
    status: string;
    submitted_at: string | null;
  };
  entries: {
    roundEntryId: string;
    bibNumber: number | null;
    displayName: string;
    heatNumber: number | null;
    danceOrder: number | null;
    leadDisplayName?: string | null;
    followBibNumber?: number | null;
    followDisplayName?: string | null;
  }[];
  scores: {
    round_entry_id: string;
    callback_value: string | null;
    ordinal: number | null;
    raw_score: number | null;
    updated_at: string;
  }[];
}

export class JudgeRoundAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Scoring context for one judged role (lead or follow round). */
export async function buildJudgeRoundViewPayload(
  roundId: string,
  assignment: Pick<JudgeWithProfile, "id" | "judge_role" | "scoring_scope" | "drops_finals">
): Promise<JudgeRoundViewPayload> {
  let ctx;
  try {
    ctx = await loadRoundContext(roundId);
  } catch (err) {
    if (err instanceof RoundDataError) {
      throw new JudgeRoundAccessError(err.message, err.status);
    }
    throw err;
  }

  if (!judgeScoresRound(assignment, ctx.round)) {
    throw new JudgeRoundAccessError(
      "Your assignment does not include this round",
      403
    );
  }

  const { data: heats } = await supabaseServer
    .from("comp_heats")
    .select("*")
    .eq("round_id", roundId)
    .order("heat_number");

  const showEntries = ["open", "closed"].includes(ctx.round.status);
  const active = showEntries ? activeRoundEntries(ctx) : [];
  const heatNumberById = new Map((heats ?? []).map((h) => [h.id, h.heat_number]));

  const sheet = ctx.sheets.find((s) => s.judge_assignment_id === assignment.id);
  const myScores = ctx.scores.filter(
    (s) => s.judge_assignment_id === assignment.id
  );

  const unresolvedCheckin = ctx.roundEntries.filter(
    (re) => !re.scratched && re.checkin_status === "pending"
  ).length;
  const presentCount = activeRoundEntries(ctx).length;

  return {
    round: {
      id: ctx.round.id,
      competition_id: ctx.round.competition_id,
      round_type: ctx.round.round_type,
      judged_role: ctx.round.judged_role,
      scoring_mode: ctx.round.scoring_mode,
      callback_count: ctx.round.callback_count,
      alternate_count: ctx.round.alternate_count,
      status: ctx.round.status,
    },
    checkin: {
      unresolved: unresolvedCheckin,
      present: presentCount,
      complete: unresolvedCheckin === 0 && presentCount > 0,
    },
    sheet: sheet
      ? { status: sheet.status, submitted_at: sheet.submitted_at }
      : { status: "draft", submitted_at: null },
    entries: active
      .map((re) => ({
        ...entryDisplay(re),
        heatNumber: re.heat_id ? heatNumberById.get(re.heat_id) ?? null : null,
        danceOrder: re.dance_order,
      }))
      .sort(
        (a, b) =>
          (a.heatNumber ?? 0) - (b.heatNumber ?? 0) ||
          (a.danceOrder ?? 0) - (b.danceOrder ?? 0) ||
          (a.bibNumber ?? 0) - (b.bibNumber ?? 0)
      ),
    scores: myScores.map((s) => ({
      round_entry_id: s.round_entry_id,
      callback_value: s.callback_value,
      ordinal: s.ordinal,
      raw_score: s.raw_score != null ? Number(s.raw_score) : null,
      updated_at: s.updated_at,
    })),
  };
}
