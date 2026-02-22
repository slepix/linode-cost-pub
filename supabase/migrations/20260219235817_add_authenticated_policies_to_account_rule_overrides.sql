/*
  # Add authenticated role policies to account_rule_overrides

  The existing policies only covered the anon role. Logged-in users operate
  as the authenticated role and were blocked from inserting/updating overrides,
  causing the "violates row-level security" error when applying profiles.

  1. Changes
    - Add SELECT, INSERT, UPDATE, DELETE policies for the authenticated role on account_rule_overrides
*/

CREATE POLICY "authenticated can select account_rule_overrides"
  ON account_rule_overrides
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated can insert account_rule_overrides"
  ON account_rule_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update account_rule_overrides"
  ON account_rule_overrides
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated can delete account_rule_overrides"
  ON account_rule_overrides
  FOR DELETE
  TO authenticated
  USING (true);
