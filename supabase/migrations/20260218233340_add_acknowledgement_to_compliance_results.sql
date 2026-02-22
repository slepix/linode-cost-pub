/*
  # Add acknowledgement support to compliance_results

  ## Summary
  Adds the ability to acknowledge non-compliant results so they are excluded
  from the compliance score while still being visible in the UI.

  ## Changes to compliance_results
  - `acknowledged` (boolean, default false) — whether this result has been acknowledged
  - `acknowledged_at` (timestamptz, nullable) — when the result was acknowledged
  - `acknowledged_note` (text, nullable) — optional note explaining the acknowledgement

  ## Notes
  - Acknowledged results still show as Non-Compliant in the UI but are marked differently
  - They are excluded from the compliance score/count
  - Acknowledgements are preserved across re-evaluations only for the same resource/rule pair
    (re-evaluation deletes and re-inserts results, so acknowledgements must be re-applied
     after evaluation — the UI will re-query after running)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_results' AND column_name = 'acknowledged'
  ) THEN
    ALTER TABLE compliance_results ADD COLUMN acknowledged boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_results' AND column_name = 'acknowledged_at'
  ) THEN
    ALTER TABLE compliance_results ADD COLUMN acknowledged_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_results' AND column_name = 'acknowledged_note'
  ) THEN
    ALTER TABLE compliance_results ADD COLUMN acknowledged_note text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compliance_results_acknowledged ON compliance_results(acknowledged);
