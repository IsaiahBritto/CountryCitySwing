-- Drop legacy day-of price columns AFTER deploying the app that uses price_changes /
-- ccs_team_price_changes only. Do NOT run this while production still selects day_of_price
-- or team_day_of_price.

ALTER TABLE public.events DROP COLUMN IF EXISTS day_of_price;
ALTER TABLE public.events DROP COLUMN IF EXISTS team_day_of_price;
