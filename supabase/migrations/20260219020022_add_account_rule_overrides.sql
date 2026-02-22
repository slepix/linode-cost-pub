/*
  # Add account_rule_overrides table

  ## Purpose
  Stores per-account enable/disable overrides for compliance rules.
  Built-in rules (account_id IS NULL) are shared globally, so we cannot
  toggle their is_active flag directly. This table provides a per-account
  layer that says "for this account, this rule is explicitly enabled or
  disabled", overriding the global default.

  ## New Tables
  - `account_rule_overrides`
    - `id` (uuid, primary key)
    - `account_id` (uuid, FK to linode_accounts)
    - `rule_id` (uuid, FK to compliance_rules)
    - `is_active` (boolean) — the override value for this account
    - `applied_by_profile_id` (uuid, nullable FK to compliance_profiles) — which profile set this override
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
    - UNIQUE (account_id, rule_id) — one override per account/rule pair

  ## Security
  - RLS enabled
  - anon role can SELECT, INSERT, UPDATE, DELETE (matches existing pattern
    used by all other account-scoped tables in this app)
*/

CREATE TABLE IF NOT EXISTS account_rule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  applied_by_profile_id uuid REFERENCES compliance_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_id, rule_id)
);

ALTER TABLE account_rule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can select account_rule_overrides"
  ON account_rule_overrides FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert account_rule_overrides"
  ON account_rule_overrides FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update account_rule_overrides"
  ON account_rule_overrides FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon can delete account_rule_overrides"
  ON account_rule_overrides FOR DELETE
  TO anon
  USING (true);
