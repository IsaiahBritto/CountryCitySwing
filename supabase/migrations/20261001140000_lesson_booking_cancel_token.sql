-- Guest private-lesson cancel links (token in confirmation email).

ALTER TABLE lesson_bookings
  ADD COLUMN IF NOT EXISTS cancel_token text;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_bookings_cancel_token_key
  ON lesson_bookings (cancel_token)
  WHERE cancel_token IS NOT NULL;
