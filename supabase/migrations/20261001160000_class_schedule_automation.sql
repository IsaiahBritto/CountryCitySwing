-- Tuesday Class staff schedule: go-live time and optional week override.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS schedule_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS class_week_override text;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_class_week_override_check;

ALTER TABLE events
  ADD CONSTRAINT events_class_week_override_check
  CHECK (
    class_week_override IS NULL
    OR class_week_override IN ('A', 'B', 'C')
  );

CREATE TABLE IF NOT EXISTS class_schedule_rotation_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  anchor_date date NOT NULL,
  anchor_week text NOT NULL CHECK (anchor_week IN ('A', 'B', 'C')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO class_schedule_rotation_config (id, anchor_date, anchor_week)
VALUES (1, '2025-09-29', 'A')
ON CONFLICT (id) DO NOTHING;

-- Server-only via service role; block direct anon/authenticated PostgREST access.
ALTER TABLE class_schedule_rotation_config ENABLE ROW LEVEL SECURITY;
