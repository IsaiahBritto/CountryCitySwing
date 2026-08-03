-- JnJ judge scoring scope, finals drop, and rotation-based finals pairing.

ALTER TABLE comp_judge_assignments
  ADD COLUMN IF NOT EXISTS scoring_scope text NOT NULL DEFAULT 'both'
    CHECK (scoring_scope IN ('lead', 'follow', 'both')),
  ADD COLUMN IF NOT EXISTS drops_finals boolean NOT NULL DEFAULT false;

ALTER TABLE comp_rounds
  ADD COLUMN IF NOT EXISTS rotation_offset integer,
  ADD COLUMN IF NOT EXISTS pairings_confirmed_at timestamptz;

ALTER TABLE comp_round_entries
  ADD COLUMN IF NOT EXISTS checkin_role text
    CHECK (checkin_role IS NULL OR checkin_role IN ('lead', 'follow'));

-- At most one judge drops finals per competition.
CREATE UNIQUE INDEX IF NOT EXISTS comp_judge_assignments_one_drops_finals
  ON comp_judge_assignments (competition_id)
  WHERE drops_finals = true;
