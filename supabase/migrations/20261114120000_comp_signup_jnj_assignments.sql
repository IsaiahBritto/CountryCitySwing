-- JnJ division assignments per signup (supports dual division, opposite roles).
-- All access goes through service-role API routes; RLS is enabled with no
-- public policies (same pattern as competitions / comp_entries).

CREATE TABLE IF NOT EXISTS comp_signup_jnj_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_signup_id uuid NOT NULL REFERENCES comp_signups (id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lead', 'follow')),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comp_signup_id, competition_id),
  UNIQUE (comp_signup_id, role)
);

CREATE INDEX IF NOT EXISTS comp_signup_jnj_assignments_signup_idx
  ON comp_signup_jnj_assignments (comp_signup_id);
CREATE INDEX IF NOT EXISTS comp_signup_jnj_assignments_competition_idx
  ON comp_signup_jnj_assignments (competition_id);

ALTER TABLE comp_signup_jnj_assignments ENABLE ROW LEVEL SECURITY;

-- Backfill primary assignment from legacy columns.
INSERT INTO comp_signup_jnj_assignments (comp_signup_id, competition_id, role, sort_order)
SELECT
  s.id,
  s.jnj_competition_id,
  CASE
    WHEN s.jnj_lead_profile_id IS NOT NULL
      OR COALESCE(TRIM(s.jnj_lead_first_name), '') <> ''
      OR s.jnj_lead_email IS NOT NULL
    THEN 'lead'
  WHEN s.jnj_follow_profile_id IS NOT NULL
      OR COALESCE(TRIM(s.jnj_follow_first_name), '') <> ''
      OR s.jnj_follow_email IS NOT NULL
    THEN 'follow'
    ELSE 'lead'
  END,
  0
FROM comp_signups s
WHERE s.jnj_selected
  AND s.jnj_competition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM comp_signup_jnj_assignments a WHERE a.comp_signup_id = s.id
  );