/*
  # Fix acknowledged_by FK to reference org_users instead of auth.users

  ## Summary
  The `acknowledged_by` column on `compliance_results` needs to reference `org_users`
  so that Supabase's PostgREST join syntax can resolve the acknowledger's email and
  full_name directly in a single query.

  ## Changes
  - Drop existing FK to auth.users (if present)
  - Add FK from compliance_results.acknowledged_by → org_users.id
*/

ALTER TABLE compliance_results
  DROP CONSTRAINT IF EXISTS compliance_results_acknowledged_by_fkey;

ALTER TABLE compliance_results
  ADD CONSTRAINT compliance_results_acknowledged_by_fkey
  FOREIGN KEY (acknowledged_by) REFERENCES org_users(id) ON DELETE SET NULL;
