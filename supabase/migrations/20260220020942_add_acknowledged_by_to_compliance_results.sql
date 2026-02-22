/*
  # Add acknowledged_by to compliance_results

  ## Summary
  Adds a `acknowledged_by` column to `compliance_results` to record which
  authenticated user accepted a finding. This supports audit traceability
  in compliance reports.

  ## Changes
  - `compliance_results.acknowledged_by` (uuid, nullable, FK → auth.users.id)
    Set when a finding is acknowledged, cleared when unacknowledged.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_results' AND column_name = 'acknowledged_by'
  ) THEN
    ALTER TABLE compliance_results
      ADD COLUMN acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
