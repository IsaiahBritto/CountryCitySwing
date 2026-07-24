-- Workshop price change schedules + signup amount_paid (ADD ONLY — safe while old code is live)
-- Does NOT drop day_of_price / team_day_of_price. Run the drop migration only after
-- the new app that uses price_changes is deployed everywhere.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS price_changes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ccs_team_price_changes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS amount_paid numeric;

-- Backfill: day_of_price → one public change on event start date (America/Chicago calendar day)
UPDATE public.events
SET price_changes = jsonb_build_array(
  jsonb_build_object(
    'effective_date', (timezone('America/Chicago', starts_at::timestamptz))::date::text,
    'price', day_of_price
  )
)
WHERE day_of_price IS NOT NULL
  AND (price_changes IS NULL OR price_changes = '[]'::jsonb);

-- Backfill: team_day_of_price → one team change on event start date
UPDATE public.events
SET ccs_team_price_changes = jsonb_build_array(
  jsonb_build_object(
    'effective_date', (timezone('America/Chicago', starts_at::timestamptz))::date::text,
    'price', team_day_of_price
  )
)
WHERE team_day_of_price IS NOT NULL
  AND (ccs_team_price_changes IS NULL OR ccs_team_price_changes = '[]'::jsonb);
