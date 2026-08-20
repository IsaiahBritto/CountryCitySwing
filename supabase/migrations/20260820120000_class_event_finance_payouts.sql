-- Manual payout rows for generic Class event finances (non-Nashville).

CREATE TABLE IF NOT EXISTS class_event_finance_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_slot_id uuid REFERENCES team_slots(id) ON DELETE SET NULL,
  role_label text NOT NULL DEFAULT '',
  payee_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_at timestamptz,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_event_finance_payouts_event_id_idx
  ON class_event_finance_payouts(event_id);

CREATE UNIQUE INDEX IF NOT EXISTS class_event_finance_payouts_slot_uidx
  ON class_event_finance_payouts(event_id, team_slot_id)
  WHERE team_slot_id IS NOT NULL;

ALTER TABLE class_event_finance_payouts ENABLE ROW LEVEL SECURITY;
