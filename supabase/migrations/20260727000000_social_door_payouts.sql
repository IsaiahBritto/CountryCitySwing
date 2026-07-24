-- Per-Doorman-slot payouts for Social finances (post 2026-07-17 Nashville-style model)

ALTER TABLE public.the_social_finances
  ADD COLUMN IF NOT EXISTS door_payouts jsonb NOT NULL DEFAULT '[]'::jsonb;
