-- Line dance reviewer assignments + extend match_source for reviewer saves.

CREATE TABLE IF NOT EXISTS spotify_line_dance_reviewers (
  profile_id uuid PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles (id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spotify_line_dance_reviewers ENABLE ROW LEVEL SECURITY;

ALTER TABLE spotify_line_dance_meta
  DROP CONSTRAINT IF EXISTS spotify_line_dance_meta_match_source_check;

ALTER TABLE spotify_line_dance_meta
  ADD CONSTRAINT spotify_line_dance_meta_match_source_check
  CHECK (match_source IN ('none', 'user', 'admin', 'reviewer'));
