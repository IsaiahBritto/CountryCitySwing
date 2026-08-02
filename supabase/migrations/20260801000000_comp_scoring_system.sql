-- Competition scoring/judging system.
-- Competitions (divisions) per comp event, per-event bibs, entries, rounds
-- (callback prelims/quarters/semis + relative-placement finals), heats,
-- per-round check-in, judge assignments/sheets/scores, and tabulated results.
-- All access goes through service-role API routes; RLS is enabled with no
-- public policies.

CREATE TABLE IF NOT EXISTS competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  comp_type text NOT NULL CHECK (comp_type IN ('jack_and_jill', 'strictly')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'in_progress', 'completed')),
  -- Small events may count the chief judge as a panel judge. When true, the
  -- CJ's sheet participates in majority math instead of being tie-break only.
  cj_in_panel boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitions_event_idx ON competitions (event_id);

ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- Per-event bib registry: one bib per person for the whole event, shared
-- across all competitions they enter.
CREATE TABLE IF NOT EXISTS comp_bibs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text,
  bib_number int NOT NULL CHECK (bib_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, bib_number)
);

CREATE INDEX IF NOT EXISTS comp_bibs_event_idx ON comp_bibs (event_id);
CREATE INDEX IF NOT EXISTS comp_bibs_event_email_idx ON comp_bibs (event_id, lower(email));

ALTER TABLE comp_bibs ENABLE ROW LEVEL SECURITY;

-- Entries: JnJ prelim entries are individuals (role lead/follow); Strictly
-- entries are couples. JnJ finals couples are created by the random draw and
-- point back at the two source individual entries.
CREATE TABLE IF NOT EXISTS comp_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (entry_kind IN ('individual', 'couple')),
  role text CHECK (role IN ('lead', 'follow')),
  lead_first_name text NOT NULL DEFAULT '',
  lead_last_name text NOT NULL DEFAULT '',
  lead_email text,
  follow_first_name text NOT NULL DEFAULT '',
  follow_last_name text NOT NULL DEFAULT '',
  follow_email text,
  lead_bib_id uuid REFERENCES comp_bibs (id) ON DELETE SET NULL,
  follow_bib_id uuid REFERENCES comp_bibs (id) ON DELETE SET NULL,
  comp_signup_id uuid REFERENCES comp_signups (id) ON DELETE SET NULL,
  source_lead_entry_id uuid REFERENCES comp_entries (id) ON DELETE SET NULL,
  source_follow_entry_id uuid REFERENCES comp_entries (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (entry_kind <> 'individual' OR role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS comp_entries_competition_idx ON comp_entries (competition_id);

ALTER TABLE comp_entries ENABLE ROW LEVEL SECURITY;

-- Rounds. JnJ callback rounds come in lead/follow pairs (judged_role); couple
-- rounds (Strictly, and JnJ finals) leave judged_role null.
CREATE TABLE IF NOT EXISTS comp_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  round_type text NOT NULL
    CHECK (round_type IN ('prelims', 'quarterfinal', 'semifinal', 'final')),
  judged_role text CHECK (judged_role IN ('lead', 'follow')),
  scoring_mode text NOT NULL
    CHECK (scoring_mode IN ('callback', 'relative_placement')),
  callback_count int,
  alternate_count int NOT NULL DEFAULT 0 CHECK (alternate_count BETWEEN 0 AND 3),
  round_order int NOT NULL DEFAULT 0,
  -- Round this one was seeded from (advancers/alternate promotion source).
  source_round_id uuid REFERENCES comp_rounds (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checkin', 'open', 'closed', 'tabulated', 'published')),
  -- Round-level tabulation snapshot (ordinal grid, majority columns, tie-break
  -- annotations, judge exclusions/replacements). Published grids render from
  -- this, never a live recompute.
  tabulation jsonb,
  tabulated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comp_rounds_competition_idx ON comp_rounds (competition_id, round_order);

ALTER TABLE comp_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS comp_heats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES comp_rounds (id) ON DELETE CASCADE,
  heat_number int NOT NULL CHECK (heat_number > 0),
  UNIQUE (round_id, heat_number)
);

ALTER TABLE comp_heats ENABLE ROW LEVEL SECURITY;

-- One row per entry per round, with per-round check-in status. A round cannot
-- open until every non-scratched entry is checked_in or absent.
CREATE TABLE IF NOT EXISTS comp_round_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES comp_rounds (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES comp_entries (id) ON DELETE CASCADE,
  heat_id uuid REFERENCES comp_heats (id) ON DELETE SET NULL,
  dance_order int,
  checkin_status text NOT NULL DEFAULT 'pending'
    CHECK (checkin_status IN ('pending', 'checked_in', 'absent')),
  scratched boolean NOT NULL DEFAULT false,
  -- Set when this entry was promoted into the round as an alternate.
  promoted_alternate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, entry_id)
);

CREATE INDEX IF NOT EXISTS comp_round_entries_round_idx ON comp_round_entries (round_id);

ALTER TABLE comp_round_entries ENABLE ROW LEVEL SECURITY;

-- Judges must have accounts. Judges cannot be competitors in the same
-- competition (enforced in the API when assigning judges and importing
-- entries).
CREATE TABLE IF NOT EXISTS comp_judge_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  judge_role text NOT NULL DEFAULT 'judge'
    CHECK (judge_role IN ('judge', 'chief_judge')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, profile_id)
);

CREATE INDEX IF NOT EXISTS comp_judge_assignments_profile_idx
  ON comp_judge_assignments (profile_id);

ALTER TABLE comp_judge_assignments ENABLE ROW LEVEL SECURITY;

-- One sheet per judge per round. Sheets lock on submit; the CJ/admin can
-- unlock only while the round is not yet tabulated.
CREATE TABLE IF NOT EXISTS comp_judge_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES comp_rounds (id) ON DELETE CASCADE,
  judge_assignment_id uuid NOT NULL REFERENCES comp_judge_assignments (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, judge_assignment_id)
);

CREATE INDEX IF NOT EXISTS comp_judge_sheets_round_idx ON comp_judge_sheets (round_id);

ALTER TABLE comp_judge_sheets ENABLE ROW LEVEL SECURITY;

-- One score per judge x round entry. Callback rounds use callback_value with
-- ranked alternates; finals use ordinal + raw_score (0.0-100.0, one decimal).
-- Ordinal uniqueness per judge is enforced at sheet submit. Scores for
-- scratched entries are kept and excluded at tabulation.
CREATE TABLE IF NOT EXISTS comp_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES comp_rounds (id) ON DELETE CASCADE,
  judge_assignment_id uuid NOT NULL REFERENCES comp_judge_assignments (id) ON DELETE CASCADE,
  round_entry_id uuid NOT NULL REFERENCES comp_round_entries (id) ON DELETE CASCADE,
  callback_value text CHECK (callback_value IN ('yes', 'alt1', 'alt2', 'alt3', 'no')),
  ordinal int CHECK (ordinal > 0),
  raw_score numeric(4, 1) CHECK (raw_score >= 0 AND raw_score <= 100),
  -- Audit: profile that entered the score when an admin entered/overrode it
  -- on the judge's behalf.
  entered_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, judge_assignment_id, round_entry_id)
);

CREATE INDEX IF NOT EXISTS comp_scores_round_judge_idx
  ON comp_scores (round_id, judge_assignment_id);

ALTER TABLE comp_scores ENABLE ROW LEVEL SECURITY;

-- Computed output per round entry, written at tabulation. CJ tie-break
-- decisions are recorded on the affected rows.
CREATE TABLE IF NOT EXISTS comp_round_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES comp_rounds (id) ON DELETE CASCADE,
  round_entry_id uuid NOT NULL REFERENCES comp_round_entries (id) ON DELETE CASCADE,
  placement int,
  advanced boolean,
  alternate_rank int,
  callback_points numeric(6, 1),
  cj_decision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, round_entry_id)
);

CREATE INDEX IF NOT EXISTS comp_round_results_round_idx ON comp_round_results (round_id);

ALTER TABLE comp_round_results ENABLE ROW LEVEL SECURITY;

-- No public policies on any table: server uses service role only.
