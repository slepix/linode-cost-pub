/*
  # Add resource_created_at column to resources table

  ## Summary
  Adds a nullable timestamptz column `resource_created_at` to the `resources` table
  to store the original creation date as reported by the cloud provider API (e.g. Linode).
  This is distinct from `created_at` which is the database row insertion time.

  ## Changes
  - `resources`: new column `resource_created_at` (timestamptz, nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'resource_created_at'
  ) THEN
    ALTER TABLE resources ADD COLUMN resource_created_at timestamptz;
  END IF;
END $$;
