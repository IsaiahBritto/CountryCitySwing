-- Link comp signups, entries, and bibs to CCS profiles.

ALTER TABLE comp_signups
  ADD COLUMN IF NOT EXISTS registrant_profile_id uuid REFERENCES profiles (id),
  ADD COLUMN IF NOT EXISTS strictly_lead_profile_id uuid REFERENCES profiles (id),
  ADD COLUMN IF NOT EXISTS strictly_follow_profile_id uuid REFERENCES profiles (id),
  ADD COLUMN IF NOT EXISTS jnj_lead_profile_id uuid REFERENCES profiles (id),
  ADD COLUMN IF NOT EXISTS jnj_follow_profile_id uuid REFERENCES profiles (id);

CREATE INDEX IF NOT EXISTS comp_signups_registrant_profile_idx
  ON comp_signups (registrant_profile_id);

ALTER TABLE comp_entries
  ADD COLUMN IF NOT EXISTS lead_profile_id uuid REFERENCES profiles (id),
  ADD COLUMN IF NOT EXISTS follow_profile_id uuid REFERENCES profiles (id);

CREATE INDEX IF NOT EXISTS comp_entries_lead_profile_idx
  ON comp_entries (lead_profile_id);
CREATE INDEX IF NOT EXISTS comp_entries_follow_profile_idx
  ON comp_entries (follow_profile_id);

ALTER TABLE comp_bibs
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles (id);

CREATE UNIQUE INDEX IF NOT EXISTS comp_bibs_event_profile_unique
  ON comp_bibs (event_id, profile_id)
  WHERE profile_id IS NOT NULL;
