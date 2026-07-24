-- Per-signup Due now override for registration desk (null = use event schedule price)

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS amount_due numeric;
