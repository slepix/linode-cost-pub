/*
  # Add metadata column to resource_relationships

  ## Overview
  Adds a JSONB `metadata` column to the `resource_relationships` table to allow
  storing additional context about a relationship (e.g., which subnet a Linode
  belongs to within a VPC, CIDR blocks, region, etc.).

  ## Changes
  - `resource_relationships`: new nullable `metadata jsonb` column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resource_relationships' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE resource_relationships ADD COLUMN metadata jsonb;
  END IF;
END $$;
