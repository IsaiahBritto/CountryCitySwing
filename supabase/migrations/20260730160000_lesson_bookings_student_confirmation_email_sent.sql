-- Track whether the student confirmation email was sent for a private lesson booking.
-- Defaults to true so existing bookings do not show a failure badge.
ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS student_confirmation_email_sent boolean NOT NULL DEFAULT true;
