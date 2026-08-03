-- Strictly and JnJ division levels for comp events.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS strictly_level text,
  ADD COLUMN IF NOT EXISTS jnj_level text;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_strictly_level_check;
ALTER TABLE events ADD CONSTRAINT events_strictly_level_check CHECK (
  strictly_level IS NULL OR strictly_level IN (
    'Open', 'TN State', 'Lower Level', 'Upper Level',
    'Beginner', 'Intermediate', 'Advanced'
  )
);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_jnj_level_check;
ALTER TABLE events ADD CONSTRAINT events_jnj_level_check CHECK (
  jnj_level IS NULL OR jnj_level IN (
    'Open', 'TN State', 'Lower Level', 'Upper Level',
    'Beginner', 'Intermediate', 'Advanced'
  )
);
