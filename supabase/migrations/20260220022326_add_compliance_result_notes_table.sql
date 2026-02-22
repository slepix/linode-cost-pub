/*
  # Add compliance_result_notes table

  ## Summary
  Creates a new table to store additional notes on acknowledged compliance results.
  This allows users to append follow-up notes after the initial acknowledgement,
  each note recording the author and timestamp.

  ## New Tables
  - `compliance_result_notes`
    - `id` (uuid, primary key)
    - `compliance_result_id` (uuid, FK to compliance_results, cascade delete)
    - `account_id` (uuid, FK to linode_accounts, cascade delete)
    - `note` (text, required)
    - `created_by` (uuid, FK to org_users, set null on delete)
    - `created_at` (timestamptz, default now())

  ## Security
  - RLS enabled
  - Authenticated users can SELECT and INSERT notes (account-scoped via user_account_access.user_id)
  - Users can only delete their own notes via org_users lookup
*/

CREATE TABLE IF NOT EXISTS compliance_result_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_result_id uuid NOT NULL REFERENCES compliance_results(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES org_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_result_id ON compliance_result_notes(compliance_result_id);
CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_account_id ON compliance_result_notes(account_id);

ALTER TABLE compliance_result_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for their accounts"
  ON compliance_result_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_account_access
      WHERE user_account_access.account_id = compliance_result_notes.account_id
        AND user_account_access.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert notes for their accounts"
  ON compliance_result_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_account_access
      WHERE user_account_access.account_id = compliance_result_notes.account_id
        AND user_account_access.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own notes"
  ON compliance_result_notes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_users
      WHERE org_users.id = compliance_result_notes.created_by
        AND org_users.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
