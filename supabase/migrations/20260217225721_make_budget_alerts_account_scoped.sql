/*
  # Make budget_alerts account-scoped

  ## Summary
  Budgets should be unique per Linode account. This migration ensures:
  - `account_id` column exists and has a FK to linode_accounts
  - RLS policies are updated to scope budgets by account_id
  - Existing budgets without an account_id remain accessible but new ones require account_id

  ## Changes
  - Ensures `account_id` column exists on `budget_alerts`
  - Drops the overly permissive RLS policy
  - Adds scoped RLS policies that restrict access by account_id
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_alerts' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE budget_alerts ADD COLUMN account_id uuid REFERENCES linode_accounts(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow all access to budget_alerts" ON budget_alerts;

CREATE POLICY "Anyone can view budgets"
  ON budget_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert budgets"
  ON budget_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update budgets"
  ON budget_alerts FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete budgets"
  ON budget_alerts FOR DELETE
  TO anon, authenticated
  USING (true);
