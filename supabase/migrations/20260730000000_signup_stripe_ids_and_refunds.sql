-- Stripe Checkout identifiers for event/comp signups (refunds) + soft-cancel status.
-- Audit table for all refunds/cancels (server writes only via service role).

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS refunded_or_cancelled text NOT NULL DEFAULT 'active';

ALTER TABLE public.comp_signups
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS refunded_or_cancelled text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signups_refunded_or_cancelled_check'
  ) THEN
    ALTER TABLE public.signups
      ADD CONSTRAINT signups_refunded_or_cancelled_check
      CHECK (refunded_or_cancelled IN ('active', 'partial', 'cancelled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comp_signups_refunded_or_cancelled_check'
  ) THEN
    ALTER TABLE public.comp_signups
      ADD CONSTRAINT comp_signups_refunded_or_cancelled_check
      CHECK (refunded_or_cancelled IN ('active', 'partial', 'cancelled'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS signups_stripe_session_id_uidx
  ON public.signups (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS signups_stripe_payment_intent_id_uidx
  ON public.signups (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS comp_signups_stripe_session_id_uidx
  ON public.comp_signups (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS comp_signups_stripe_payment_intent_id_uidx
  ON public.comp_signups (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN public.signups.stripe_session_id IS
  'Stripe Checkout Session id (cs_...) for this paid signup.';
COMMENT ON COLUMN public.signups.stripe_payment_intent_id IS
  'Stripe PaymentIntent id (pi_...) used for refunds.';
COMMENT ON COLUMN public.signups.refunded_or_cancelled IS
  'active | partial | cancelled. cancelled rows are hidden from registration.';

COMMENT ON COLUMN public.comp_signups.stripe_session_id IS
  'Stripe Checkout Session id (cs_...) for this paid comp signup.';
COMMENT ON COLUMN public.comp_signups.stripe_payment_intent_id IS
  'Stripe PaymentIntent id (pi_...) used for refunds.';
COMMENT ON COLUMN public.comp_signups.refunded_or_cancelled IS
  'active | partial | cancelled. cancelled rows are hidden from registration.';

CREATE TABLE IF NOT EXISTS public.signup_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL,
  event_title text,
  signup_id text,
  comp_signup_id text,
  is_comp boolean NOT NULL DEFAULT false,
  payment_method text,
  mode text NOT NULL,
  amount_refunded numeric NOT NULL DEFAULT 0,
  principal_refunded numeric NOT NULL DEFAULT 0,
  fee_refunded numeric NOT NULL DEFAULT 0,
  tax_refunded numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  stripe_payment_intent_id text,
  stripe_refund_id text,
  refunded_or_cancelled_result text NOT NULL,
  refunded_by_email text,
  note text,
  signup_email text,
  signup_name text,
  CONSTRAINT signup_refunds_mode_check
    CHECK (mode IN ('full', 'partial', 'cancel_unpaid')),
  CONSTRAINT signup_refunds_result_check
    CHECK (refunded_or_cancelled_result IN ('partial', 'cancelled')),
  CONSTRAINT signup_refunds_signup_ref_check
    CHECK (
      (is_comp = false AND signup_id IS NOT NULL)
      OR (is_comp = true AND comp_signup_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS signup_refunds_event_id_idx
  ON public.signup_refunds (event_id);
CREATE INDEX IF NOT EXISTS signup_refunds_signup_id_idx
  ON public.signup_refunds (signup_id)
  WHERE signup_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_refunds_comp_signup_id_idx
  ON public.signup_refunds (comp_signup_id)
  WHERE comp_signup_id IS NOT NULL;

ALTER TABLE public.signup_refunds ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: only service role (supabaseServer) can read/write.
COMMENT ON TABLE public.signup_refunds IS
  'Audit log of event/comp refunds and cancels. Written by server only.';
