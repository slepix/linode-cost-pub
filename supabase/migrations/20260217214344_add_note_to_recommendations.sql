/*
  # Add note column to recommendations

  Adds an optional `note` field to the recommendations table to store
  the AI's mandatory caveat explaining that sizing was inferred from
  CPU and Disk I/O only, and that RAM/GPU usage were not observable.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'note'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN note text;
  END IF;
END $$;
