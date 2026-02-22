/*
  # Add last_evaluated_at to linode_accounts

  ## Summary
  Adds a `last_evaluated_at` timestamp column to the `linode_accounts` table so we can
  track when compliance rules were last evaluated for an account independently of when
  the account's resources were last synced.

  ## Changes
  - `linode_accounts`: new nullable `last_evaluated_at` timestamptz column

  ## Purpose
  The UI uses the difference between `last_sync_at` and `last_evaluated_at` to show
  a "new data available" indicator on the Run Evaluation button, prompting users to
  re-run evaluation after a sync has brought in fresh resource data.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'linode_accounts' AND column_name = 'last_evaluated_at'
  ) THEN
    ALTER TABLE linode_accounts ADD COLUMN last_evaluated_at timestamptz;
  END IF;
END $$;
