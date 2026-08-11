-- JnJ per-role head judge for callback round tie-breaks.

ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS lead_head_judge_assignment_id uuid
    REFERENCES comp_judge_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_head_judge_assignment_id uuid
    REFERENCES comp_judge_assignments(id) ON DELETE SET NULL;
