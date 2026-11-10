-- Legal compliance audit: newsletter consent audit trail + waiver versioning on signups.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS newsletter_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS newsletter_consent_source text,
  ADD COLUMN IF NOT EXISTS newsletter_consent_ip text,
  ADD COLUMN IF NOT EXISTS newsletter_opt_out_at timestamptz;

ALTER TABLE signups
  ADD COLUMN IF NOT EXISTS liability_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS liability_waiver_version text,
  ADD COLUMN IF NOT EXISTS photo_release_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_release_waiver_version text,
  ADD COLUMN IF NOT EXISTS accept_photo_release boolean;

ALTER TABLE comp_signups
  ADD COLUMN IF NOT EXISTS liability_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS liability_waiver_version text,
  ADD COLUMN IF NOT EXISTS photo_release_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_release_waiver_version text;
