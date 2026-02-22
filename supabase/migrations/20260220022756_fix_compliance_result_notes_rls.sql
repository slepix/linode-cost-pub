/*
  # Fix compliance_result_notes RLS policies

  ## Summary
  The original INSERT and SELECT policies checked user_account_access.user_id = auth.uid(),
  but admins are not always present in user_account_access. This migration drops and replaces
  the policies to also allow admin users (whose org_users.role = 'admin') to access all notes,
  matching the access pattern used by the rest of the compliance system.
*/

DROP POLICY IF EXISTS "Users can view notes for their accounts" ON compliance_result_notes;
DROP POLICY IF EXISTS "Users can insert notes for their accounts" ON compliance_result_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON compliance_result_notes;

CREATE POLICY "Users can view notes for their accounts"
  ON compliance_result_notes FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM user_account_access
      WHERE user_account_access.account_id = compliance_result_notes.account_id
        AND user_account_access.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert notes for their accounts"
  ON compliance_result_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM user_account_access
      WHERE user_account_access.account_id = compliance_result_notes.account_id
        AND user_account_access.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own notes"
  ON compliance_result_notes FOR DELETE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM org_users
      WHERE org_users.id = compliance_result_notes.created_by
        AND org_users.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
