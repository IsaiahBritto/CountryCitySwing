-- All American competition type + judge primary bib for couple entries

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_comp_type_check;

ALTER TABLE competitions
  ADD CONSTRAINT competitions_comp_type_check
  CHECK (comp_type IN ('jack_and_jill', 'strictly', 'all_american'));

COMMENT ON CONSTRAINT competitions_comp_type_check ON competitions IS
  'jack_and_jill | strictly | all_american';

ALTER TABLE comp_entries
  ADD COLUMN IF NOT EXISTS judge_primary_bib_role text
    CHECK (judge_primary_bib_role IS NULL OR judge_primary_bib_role IN ('lead', 'follow'));

COMMENT ON COLUMN comp_entries.judge_primary_bib_role IS
  'For All American couples: follow = show follow bib when lead has multiple partners; default lead';
