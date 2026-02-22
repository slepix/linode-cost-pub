/*
  # Make compliance_results.resource_id nullable

  ## Overview
  Allows account-level compliance rules (e.g. "all users have TFA enabled")
  to store results without linking to a specific resource row.

  ## Changes
  - `compliance_results.resource_id` — changed from NOT NULL to nullable
    so that rules that evaluate account-level data (users, settings) can
    insert results with no associated resource.

  ## Notes
  - Existing rows are unaffected (all current rows have a valid resource_id).
  - The FK constraint to resources(id) is preserved; only the NOT NULL
    constraint is dropped.
*/

ALTER TABLE compliance_results ALTER COLUMN resource_id DROP NOT NULL;
