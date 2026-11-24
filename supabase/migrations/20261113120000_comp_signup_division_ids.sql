-- One chosen competition division per comp type on event registration.

ALTER TABLE comp_signups
  ADD COLUMN IF NOT EXISTS jnj_competition_id uuid REFERENCES competitions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strictly_competition_id uuid REFERENCES competitions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS all_american_competition_id uuid REFERENCES competitions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS all_american_selected boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS comp_signups_jnj_competition_idx
  ON comp_signups (jnj_competition_id);
CREATE INDEX IF NOT EXISTS comp_signups_strictly_competition_idx
  ON comp_signups (strictly_competition_id);
CREATE INDEX IF NOT EXISTS comp_signups_all_american_competition_idx
  ON comp_signups (all_american_competition_id);
