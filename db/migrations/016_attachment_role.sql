-- 016_attachment_role.sql
-- 11th-edition leader attachment: persist the role a unit plays in an
-- "Attached Units" group so downstream analytics can model Leader/Support/
-- Bodyguard relationships.
--
-- list_units.attached_to_unit_id already exists (001) but was never populated;
-- the writer now sets it (Leader/Support → their Bodyguard) alongside this new
-- role column. NULL for every 10th-edition unit (no attachment concept), so
-- this is additive and inert for the current corpus.

ALTER TABLE list_units
  ADD COLUMN attachment_role TEXT
    CHECK (attachment_role IN ('Leader', 'Support', 'Bodyguard'));

CREATE INDEX IF NOT EXISTS idx_list_units_attachment
  ON list_units (attached_to_unit_id)
  WHERE attached_to_unit_id IS NOT NULL;
