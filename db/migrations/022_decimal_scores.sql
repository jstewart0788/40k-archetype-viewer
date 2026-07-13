-- 022_decimal_scores.sql
-- Some July 2026 events report half-point scores (e.g. p2_vp = 38.5 — tie-break
-- or paint adjustments folded into the victory-point total by the organizer's
-- scoring config). The VP/margin columns were INTEGER and rejected those rows,
-- failing the whole event's ingest transaction. Widen to REAL: 0.5 increments
-- are exact in binary floating point, and every downstream consumer already
-- treats these as floats.
--
-- The two dbt rules views select these columns, which blocks ALTER TYPE; drop
-- them here and let the next `dbt run` recreate them (on a fresh install they
-- don't exist yet, so IF EXISTS makes this a no-op).

BEGIN;

DROP VIEW IF EXISTS v_eligible_games;
DROP VIEW IF EXISTS v_games_resolved;

ALTER TABLE games
  ALTER COLUMN p1_vp     TYPE REAL,
  ALTER COLUMN p2_vp     TYPE REAL,
  ALTER COLUMN p1_margin TYPE REAL,
  ALTER COLUMN p2_margin TYPE REAL;

ALTER TABLE game_rounds
  ALTER COLUMN p1_vp_this_round TYPE REAL,
  ALTER COLUMN p2_vp_this_round TYPE REAL,
  ALTER COLUMN p1_vp_cumulative TYPE REAL,
  ALTER COLUMN p2_vp_cumulative TYPE REAL;

COMMIT;
