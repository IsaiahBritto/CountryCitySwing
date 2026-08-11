import { describe, expect, it } from "vitest";
import {
  aggregateStatusForRow,
  buildSlotJudgeProgress,
  scopeLabelForJudge,
  type JudgeRoleProgress,
} from "@/lib/comps/judgeProgress";
import type { JudgeWithProfile, RoundContext } from "@/lib/comps/roundData";
import type { CompRoundRow, RoundStatus } from "@/lib/comps/types";

function judge(
  id: string,
  overrides: Partial<JudgeWithProfile> = {}
): JudgeWithProfile {
  return {
    id,
    competition_id: "comp-1",
    profile_id: `p-${id}`,
    judge_role: "judge",
    scoring_scope: "both",
    drops_finals: false,
    first_name: "Test",
    last_name: id,
    email: null,
    ...overrides,
  };
}

function roundCtx(
  judgedRole: "lead" | "follow",
  status: RoundStatus,
  opts: {
    judgeSheets?: { judgeId: string; status: "draft" | "submitted" }[];
    scoreCounts?: Record<string, number>;
    entryCount?: number;
  } = {}
): RoundContext {
  const roundId = judgedRole === "lead" ? "round-lead" : "round-follow";
  const round: CompRoundRow = {
    id: roundId,
    competition_id: "comp-1",
    round_type: "prelims",
    judged_role: judgedRole,
    scoring_mode: "callback",
    status,
    callback_count: 10,
    alternate_count: 2,
    round_order: 1,
    source_round_id: null,
    tabulation: null,
    published_at: null,
    tabulated_at: null,
    rotation_offset: null,
    pairings_confirmed_at: null,
    created_at: "",
    updated_at: "",
  };

  const entryCount = opts.entryCount ?? 30;
  const roundEntries = Array.from({ length: entryCount }, (_, i) => ({
    id: `${roundId}-re-${i}`,
    round_id: roundId,
    entry_id: `e-${i}`,
    heat_id: null,
    dance_order: i + 1,
    checkin_status: "checked_in" as const,
    checkin_role: judgedRole,
    scratched: false,
    promoted_alternate: false,
    created_at: "",
    updated_at: "",
    entry: {
      id: `e-${i}`,
      competition_id: "comp-1",
      lead_profile_id: null,
      follow_profile_id: null,
      lead_bib_id: null,
      follow_bib_id: null,
      lead_bib: { bib_number: i + 1 },
      follow_bib: { bib_number: i + 100 },
    },
  }));

  const sheets = (opts.judgeSheets ?? []).map((s) => ({
    id: `sheet-${s.judgeId}-${roundId}`,
    round_id: roundId,
    judge_assignment_id: s.judgeId,
    status: s.status,
    submitted_at: s.status === "submitted" ? new Date().toISOString() : null,
    created_at: "",
    updated_at: "",
  }));

  const scores: RoundContext["scores"] = [];
  for (const [judgeId, count] of Object.entries(opts.scoreCounts ?? {})) {
    for (let i = 0; i < count; i++) {
      scores.push({
        id: `score-${judgeId}-${roundId}-${i}`,
        round_id: roundId,
        judge_assignment_id: judgeId,
        round_entry_id: `${roundId}-re-${i}`,
        callback_value: "yes",
        ordinal: null,
        created_at: "",
        updated_at: "",
      });
    }
  }

  return {
    round,
    competition: {
      id: "comp-1",
      name: "Test",
      comp_type: "jack_and_jill",
      status: "in_progress",
      event_id: null,
      cj_in_panel: false,
      test_comp: true,
      created_at: "",
      updated_at: "",
    },
    judges: [],
    sheets,
    roundEntries: roundEntries as RoundContext["roundEntries"],
    scores,
  };
}

describe("buildSlotJudgeProgress", () => {
  const leadJudge = judge("j-lead", { scoring_scope: "lead" });
  const followJudge = judge("j-follow", { scoring_scope: "follow" });
  const cj = judge("j-cj", { judge_role: "chief_judge", scoring_scope: "both" });

  it("lead-scoped judge is panel on leads only, not tie-break", () => {
    const leadCtx = roundCtx("lead", "open", {
      judgeSheets: [{ judgeId: "j-lead", status: "submitted" }],
      scoreCounts: { "j-lead": 30 },
    });
    const followCtx = roundCtx("follow", "open");

    const result = buildSlotJudgeProgress(
      "prelims",
      [leadJudge, followJudge, cj],
      leadCtx,
      followCtx,
      false
    );

    const row = result.judges.find((r) => r.assignmentId === "j-lead")!;
    expect(row.leads?.isPanel).toBe(true);
    expect(row.follows).toBeNull();
    expect(row.tieBreakOnly).toBe(false);
    expect(row.scopeLabel).toBe("scores leads");
    expect(row.aggregateStatus).toBe("complete");
  });

  it("follow-scoped judge is panel on follows only", () => {
    const leadCtx = roundCtx("lead", "open");
    const followCtx = roundCtx("follow", "open", {
      judgeSheets: [{ judgeId: "j-follow", status: "draft" }],
      scoreCounts: { "j-follow": 10 },
    });

    const result = buildSlotJudgeProgress(
      "prelims",
      [leadJudge, followJudge],
      leadCtx,
      followCtx,
      false
    );

    const row = result.judges.find((r) => r.assignmentId === "j-follow")!;
    expect(row.follows?.isPanel).toBe(true);
    expect(row.leads).toBeNull();
    expect(row.aggregateStatus).toBe("scoring");
  });

  it("CJ with cj_in_panel false is tie-break only with sheets on both rounds", () => {
    const leadCtx = roundCtx("lead", "closed", {
      judgeSheets: [{ judgeId: "j-cj", status: "submitted" }],
      scoreCounts: { "j-cj": 30 },
    });
    const followCtx = roundCtx("follow", "closed", {
      judgeSheets: [{ judgeId: "j-cj", status: "submitted" }],
      scoreCounts: { "j-cj": 30 },
    });

    const result = buildSlotJudgeProgress(
      "prelims",
      [cj],
      leadCtx,
      followCtx,
      false
    );

    const row = result.judges[0];
    expect(row.tieBreakOnly).toBe(true);
    expect(row.leads?.isPanel).toBe(false);
    expect(row.follows?.isPanel).toBe(false);
    expect(row.aggregateStatus).toBe("complete");
    expect(result.summary.chiefJudgeComplete).toBe(true);
  });

  it("lead submitted + follow draft yields scoring aggregate", () => {
    const leadCtx = roundCtx("lead", "open", {
      judgeSheets: [{ judgeId: "j-both", status: "submitted" }],
    });
    const followCtx = roundCtx("follow", "open", {
      judgeSheets: [{ judgeId: "j-both", status: "draft" }],
    });
    const bothJudge = judge("j-both", { scoring_scope: "both" });

    const result = buildSlotJudgeProgress(
      "prelims",
      [bothJudge],
      leadCtx,
      followCtx,
      false
    );

    expect(result.judges[0].aggregateStatus).toBe("scoring");
  });

  it("round not yet open yields sheetStatus none", () => {
    const leadCtx = roundCtx("lead", "checkin");
    const result = buildSlotJudgeProgress(
      "prelims",
      [leadJudge],
      leadCtx,
      null,
      false
    );

    expect(result.judges[0].leads?.sheetStatus).toBe("none");
    expect(result.judges[0].aggregateStatus).toBe("waiting");
  });
});

describe("aggregateStatusForRow", () => {
  it("returns complete when all applicable rounds submitted", () => {
    const leads: JudgeRoleProgress = {
      roundId: "a",
      roundStatus: "closed",
      isPanel: true,
      sheetStatus: "submitted",
      scored: 30,
      total: 30,
    };
    expect(aggregateStatusForRow(leads, null)).toBe("complete");
  });
});

describe("scopeLabelForJudge", () => {
  it("returns null for CJ and both scope", () => {
    expect(scopeLabelForJudge(judge("x", { judge_role: "chief_judge" }))).toBeNull();
    expect(scopeLabelForJudge(judge("x", { scoring_scope: "both" }))).toBeNull();
  });
});
