-- 029_player_final_record_nullable.sql
-- Let a player's final event record be UNKNOWN.
--
-- WHY: `final_record_w/l/d` were declared INT NOT NULL DEFAULT 0. The extractor
-- never supplied them, so every one of the 102,395 player rows carries 0-0-0 —
-- and a real 0-0-0 (a player who registered and played nothing) is
-- indistinguishable from "we never captured this". The site rendered that as
-- eventRecord "0-0" on every example-list card, which is why the field has been
-- unusable since it was added.
--
-- A default of zero is the wrong default for a measurement. Absence of data is
-- not a score of nothing, and encoding it as one destroys the distinction at
-- write time, where no downstream consumer can recover it. NULL says "not
-- known"; 0 says "played and won none". The extractor fix supplies real values
-- for ~90% of players and must be able to say nothing about the rest.
--
-- The same argument applies to `battle_points_total`, `margin_of_victory_total`
-- and `strength_of_schedule`, which are already nullable — this brings the
-- record columns in line with the rest of the metrics block.
--
-- SAFE ON EXISTING DATA: dropping NOT NULL widens the domain, so every current
-- row stays valid. The zeros are then rewritten by the backfill; they are not
-- silently reinterpreted as NULL here, because this migration deliberately does
-- NOT touch existing values — a blanket UPDATE to NULL would also erase any
-- genuine 0-0-0, and we cannot tell them apart yet. The backfill overwrites
-- from the cached payloads instead, which knows the difference.

ALTER TABLE players ALTER COLUMN final_record_w DROP NOT NULL;
ALTER TABLE players ALTER COLUMN final_record_l DROP NOT NULL;
ALTER TABLE players ALTER COLUMN final_record_d DROP NOT NULL;

ALTER TABLE players ALTER COLUMN final_record_w DROP DEFAULT;
ALTER TABLE players ALTER COLUMN final_record_l DROP DEFAULT;
ALTER TABLE players ALTER COLUMN final_record_d DROP DEFAULT;

COMMENT ON COLUMN players.final_record_w IS
  'Wins in the player''s final event record. NULL means not captured — never '
  'assume 0. Sourced from the army-list payload''s player metrics block, which '
  'is the only place upstream reports it; the player endpoint does not.';
COMMENT ON COLUMN players.final_record_l IS 'Losses; NULL means not captured.';
COMMENT ON COLUMN players.final_record_d IS 'Draws; NULL means not captured.';
