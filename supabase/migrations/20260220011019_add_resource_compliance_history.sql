/*
  # Add resource_compliance_history table

  ## Purpose
  Stores per-resource compliance snapshots each time evaluation runs, enabling
  the historical timeline to show the exact pass/fail status for each rule on
  a specific resource at each point in time.

  ## New Tables
  - `resource_compliance_history`
    - `id` (uuid, pk)
    - `account_id` (uuid, fk to linode_accounts)
    - `resource_id` (uuid, fk to resources)
    - `evaluated_at` (timestamptz) — matches compliance_score_history.evaluated_at
    - `results` (jsonb) — array of { rule_id, rule_name, severity, status, detail }

  ## Security
  - RLS enabled
  - SELECT/INSERT: authenticated users with access to the account via user_account_access
*/

CREATE TABLE IF NOT EXISTS resource_compliance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rch_resource_id ON resource_compliance_history(resource_id);
CREATE INDEX IF NOT EXISTS idx_rch_account_id ON resource_compliance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_rch_evaluated_at ON resource_compliance_history(evaluated_at DESC);

ALTER TABLE resource_compliance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with account access can read resource compliance history"
  ON resource_compliance_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_account_access
      WHERE user_account_access.account_id = resource_compliance_history.account_id
        AND user_account_access.user_id = auth.uid()
    )
  );

CREATE POLICY "Users with account access can insert resource compliance history"
  ON resource_compliance_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_account_access
      WHERE user_account_access.account_id = resource_compliance_history.account_id
        AND user_account_access.user_id = auth.uid()
    )
  );
