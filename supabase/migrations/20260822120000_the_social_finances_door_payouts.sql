-- Door position payout rows for post-cutoff Social event finances.

ALTER TABLE the_social_finances
  ADD COLUMN IF NOT EXISTS door_payouts jsonb NOT NULL DEFAULT '[]'::jsonb;
