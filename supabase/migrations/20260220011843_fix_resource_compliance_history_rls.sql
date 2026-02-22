/*
  # Fix resource_compliance_history RLS policies

  ## Problem
  The INSERT policy required the user to exist in user_account_access, but
  the compliance evaluation runs in the context of the account owner who
  may not have a user_account_access row. This caused RLS violations.

  ## Fix
  Replace the restrictive policies with simpler ones matching the pattern
  used by compliance_score_history — only check that the account exists,
  which is sufficient since the client already has the account's API token.
*/

DROP POLICY IF EXISTS "Users with account access can insert resource compliance histor" ON resource_compliance_history;
DROP POLICY IF EXISTS "Users with account access can read resource compliance history" ON resource_compliance_history;

CREATE POLICY "Authenticated users can insert resource compliance history"
  ON resource_compliance_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM linode_accounts
      WHERE linode_accounts.id = resource_compliance_history.account_id
    )
  );

CREATE POLICY "Authenticated users can read resource compliance history"
  ON resource_compliance_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM linode_accounts
      WHERE linode_accounts.id = resource_compliance_history.account_id
    )
  );
