/*
  # Fix compliance_result_notes RLS — match compliance_results open pattern

  ## Summary
  The compliance_results table itself uses open USING (true) / WITH CHECK (true) policies
  for all authenticated users, relying on application-level access control. We align
  compliance_result_notes to the same pattern so any authenticated user can read/write notes.
  The delete policy retains an ownership check so users can only delete their own notes.
*/

DROP POLICY IF EXISTS "Users can view notes for their accounts" ON compliance_result_notes;
DROP POLICY IF EXISTS "Users can insert notes for their accounts" ON compliance_result_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON compliance_result_notes;

CREATE POLICY "Authenticated users can view compliance result notes"
  ON compliance_result_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance result notes"
  ON compliance_result_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete their own compliance result notes"
  ON compliance_result_notes FOR DELETE
  TO authenticated
  USING (
    created_by IS NULL
    OR EXISTS (
      SELECT 1 FROM org_users
      WHERE org_users.id = compliance_result_notes.created_by
        AND org_users.id = auth.uid()
    )
    OR is_admin()
  );
