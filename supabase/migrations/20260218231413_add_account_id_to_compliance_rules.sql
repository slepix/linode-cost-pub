/*
  # Add account_id to compliance_rules

  ## Summary
  Makes compliance rules per-account. Built-in rules have account_id = NULL
  and are visible to all accounts. User-created rules are scoped to a specific
  Linode account.

  ## Changes
  - compliance_rules: add nullable account_id (foreign key to linode_accounts)
  - compliance_rules: add index on account_id
  - Built-in rules retain account_id = NULL (shared across all accounts)

  ## Notes
  - NULL account_id = built-in rule visible to all accounts
  - Non-NULL account_id = custom rule belonging to that account only
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_rules' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE compliance_rules
      ADD COLUMN account_id uuid REFERENCES linode_accounts(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compliance_rules_account_id ON compliance_rules(account_id);
