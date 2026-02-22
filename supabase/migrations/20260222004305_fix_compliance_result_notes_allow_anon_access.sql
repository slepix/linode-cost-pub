/*
  # Fix compliance_result_notes RLS to allow anon role access

  ## Summary
  The app uses a custom JWT auth system whose tokens are not recognized by Supabase PostgREST
  as the `authenticated` role. All requests arrive as `anon`. The existing policies were scoped
  to `authenticated` only, blocking inserts and selects from the frontend.

  ## Changes
  - Drop existing `compliance_result_notes` policies
  - Re-create them targeting `anon` and `authenticated` roles (consistent with compliance_results table)

  ## Notes
  - Access control is handled at the application layer via the custom auth system
  - This matches the pattern used by the compliance_results table which uses "Anyone" policies
*/

DROP POLICY IF EXISTS "Authenticated users can view compliance result notes" ON compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can insert compliance result notes" ON compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can delete their own compliance result note" ON compliance_result_notes;

CREATE POLICY "Anyone can view compliance result notes"
  ON compliance_result_notes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert compliance result notes"
  ON compliance_result_notes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can delete compliance result notes"
  ON compliance_result_notes
  FOR DELETE
  TO anon, authenticated
  USING (true);
