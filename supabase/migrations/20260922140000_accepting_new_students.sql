-- Directory filter: instructors opt in to accepting new private-lesson students.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accepting_new_students boolean NOT NULL DEFAULT false;
