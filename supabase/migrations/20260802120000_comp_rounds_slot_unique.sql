-- One round row per competition slot (Strictly: per round_type; JnJ: per round_type + judged_role).
CREATE UNIQUE INDEX IF NOT EXISTS comp_rounds_slot_unique
  ON comp_rounds (competition_id, round_type, COALESCE(judged_role, ''));
