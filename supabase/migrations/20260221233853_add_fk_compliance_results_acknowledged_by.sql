/*
  # Add foreign key for compliance_results.acknowledged_by

  ## Summary
  The `acknowledged_by` column on `compliance_results` stores the UUID of the org_user
  who acknowledged the result, but no foreign key constraint existed. This caused PostgREST
  to refuse join queries (e.g., fetching acknowledger name/email alongside results).

  ## Changes
  - Adds FK constraint from `compliance_results.acknowledged_by` → `org_users.id`
  - Uses ON DELETE SET NULL so deleting an org_user doesn't orphan compliance results
*/

ALTER TABLE compliance_results
  ADD CONSTRAINT compliance_results_acknowledged_by_fkey
  FOREIGN KEY (acknowledged_by)
  REFERENCES org_users(id)
  ON DELETE SET NULL;
