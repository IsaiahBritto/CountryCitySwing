/** Shared row/domain types for the competition scoring system. */

export type CompType = "jack_and_jill" | "strictly";
export type CompStatus = "setup" | "in_progress" | "completed";
export type EntryKind = "individual" | "couple";
export type DanceRole = "lead" | "follow";
export type RoundType = "prelims" | "quarterfinal" | "semifinal" | "final";
export type ScoringMode = "callback" | "relative_placement";
export type RoundStatus =
  | "pending"
  | "checkin"
  | "open"
  | "closed"
  | "tabulated"
  | "published";
export type CheckinStatus = "pending" | "checked_in" | "absent";
export type JudgeRole = "judge" | "chief_judge";
export type ScoringScope = "lead" | "follow" | "both";
export type CheckinRole = "lead" | "follow";
export type SheetStatus = "draft" | "submitted";
export type CallbackValue = "yes" | "alt1" | "alt2" | "alt3" | "no";
export type PairingMode = "rotation" | "manual";

export interface ManualPairingRow {
  lead_round_entry_id: string;
  follow_round_entry_id: string;
}

export interface TieBreakJudgeLabel {
  assignmentId: string;
  label: string;
  name: string;
  kind: "head_judge" | "chief_judge";
  displayLabel: string;
}

export interface FallbackChiefJudgeLabel {
  assignmentId: string;
  label: string;
  name: string;
}

export interface ChiefJudgeVotesForReview {
  assignmentId: string;
  label: string;
  name: string;
  votes: Record<string, CallbackValue | "no">;
}

export interface CompetitionRow {
  id: string;
  event_id: string;
  comp_type: CompType;
  name: string;
  status: CompStatus;
  cj_in_panel: boolean;
  lead_head_judge_assignment_id: string | null;
  follow_head_judge_assignment_id: string | null;
  max_floor_couples: number | null;
  test_comp?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompBibRow {
  id: string;
  event_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  bib_number: number | null;
  profile_id: string | null;
}

export interface CompEventStaffRow {
  id: string;
  event_id: string;
  profile_id: string;
  created_at: string;
}

export interface CompEntryRow {
  id: string;
  competition_id: string;
  entry_kind: EntryKind;
  role: DanceRole | null;
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string | null;
  follow_first_name: string;
  follow_last_name: string;
  follow_email: string | null;
  lead_profile_id: string | null;
  follow_profile_id: string | null;
  lead_bib_id: string | null;
  follow_bib_id: string | null;
  comp_signup_id: string | null;
  source_lead_entry_id: string | null;
  source_follow_entry_id: string | null;
}

export interface CompSignupRow {
  id: string;
  event_id: string;
  event_title: string;
  registrant_profile_id: string | null;
  strictly_selected: boolean;
  strictly_lead_profile_id: string | null;
  strictly_follow_profile_id: string | null;
  strictly_lead_first_name: string | null;
  strictly_lead_last_name: string | null;
  strictly_lead_email: string | null;
  strictly_follow_first_name: string | null;
  strictly_follow_last_name: string | null;
  strictly_follow_email: string | null;
  jnj_selected: boolean;
  jnj_lead_profile_id: string | null;
  jnj_follow_profile_id: string | null;
  jnj_lead_first_name: string | null;
  jnj_lead_last_name: string | null;
  jnj_lead_email: string | null;
  jnj_follow_first_name: string | null;
  jnj_follow_last_name: string | null;
  jnj_follow_email: string | null;
  paid: boolean;
}

export interface CompRoundRow {
  id: string;
  competition_id: string;
  round_type: RoundType;
  judged_role: DanceRole | null;
  scoring_mode: ScoringMode;
  callback_count: number | null;
  alternate_count: number;
  round_order: number;
  source_round_id: string | null;
  status: RoundStatus;
  tabulation: RoundTabulation | null;
  tabulated_at: string | null;
  published_at: string | null;
  rotation_offset: number | null;
  pairings_confirmed_at: string | null;
  pairing_mode: PairingMode;
  manual_pairings: ManualPairingRow[] | null;
  heat_count: number | null;
  heat_return_count: number;
  heat_return_role: DanceRole | null;
}

export interface CompHeatRow {
  id: string;
  round_id: string;
  heat_number: number;
}

export interface CompRoundEntryRow {
  id: string;
  round_id: string;
  entry_id: string;
  heat_id: string | null;
  dance_order: number | null;
  checkin_status: CheckinStatus;
  scratched: boolean;
  promoted_alternate: boolean;
  checkin_role: CheckinRole | null;
}

export interface CompJudgeAssignmentRow {
  id: string;
  competition_id: string;
  profile_id: string;
  judge_role: JudgeRole;
  scoring_scope: ScoringScope;
  drops_finals: boolean;
}

export interface CompJudgeSheetRow {
  id: string;
  round_id: string;
  judge_assignment_id: string;
  status: SheetStatus;
  submitted_at: string | null;
  updated_at: string;
}

export interface CompScoreRow {
  id: string;
  round_id: string;
  judge_assignment_id: string;
  round_entry_id: string;
  callback_value: CallbackValue | null;
  ordinal: number | null;
  raw_score: number | null;
  entered_by: string | null;
  updated_at: string;
}

export interface CompRoundResultRow {
  id: string;
  round_id: string;
  round_entry_id: string;
  placement: number | null;
  advanced: boolean | null;
  alternate_rank: number | null;
  callback_points: number | null;
  cj_decision: string | null;
}

/** Display info baked into tabulation snapshots and results payloads. */
export interface EntryDisplay {
  roundEntryId: string;
  entryId: string;
  /** Bib shown to judges/public. Couples display the leader's bib. */
  bibNumber: number | null;
  /** "Jane Doe" or "Jack Doe & Jill Roe". */
  displayName: string;
  role: DanceRole | null;
  /** JnJ finals: leader name (couples). */
  leadDisplayName?: string | null;
  /** JnJ finals: follow bib shown secondary to lead. */
  followBibNumber?: number | null;
  followDisplayName?: string | null;
}

/** Round-level tabulation snapshot stored on comp_rounds.tabulation. */
export type RoundTabulation =
  | {
      mode: "relative_placement";
      judges: { assignmentId: string; label: string; name: string }[];
      chiefJudge: { assignmentId: string; label: string; name: string } | null;
      majority: number;
      entries: EntryDisplay[];
      grid: {
        roundEntryId: string;
        ordinals: number[];
        cells: { count: number; sum: number; majority: boolean }[];
        placement: number | null;
        decidedAtLevel: number | null;
        tieBreakNote: string | null;
        chiefJudgeOrdinal: number | null;
      }[];
    }
  | {
      mode: "callback";
      judges: { assignmentId: string; label: string; name: string }[];
      /** @deprecated Use tieBreakJudge; kept for legacy published tabulations. */
      chiefJudge: { assignmentId: string; label: string; name: string } | null;
      tieBreakJudge?: TieBreakJudgeLabel | null;
      fallbackChiefJudge?: FallbackChiefJudgeLabel | null;
      /** Admin-only; omitted from public results payloads. */
      chiefJudgeVotesForReview?: ChiefJudgeVotesForReview | null;
      callbackCount: number;
      alternateCount: number;
      entries: EntryDisplay[];
      ranked: {
        roundEntryId: string;
        points: number;
        rank: number;
        advanced: boolean;
        alternateRank: number | null;
        resolvedByDecision: boolean;
        resolvedByDecisionWithCjScores?: boolean;
        resolvedByHeadJudge?: boolean;
        resolvedByChiefJudge: boolean;
        tieBreakNote: string | null;
        votes: (CallbackValue | "no")[];
        headJudgeVote?: CallbackValue | "no" | null;
        chiefJudgeVote: CallbackValue | "no" | null;
      }[];
    };
