/*
  # Add Compliance Score History Table

  ## Summary
  Creates a new table to store a historical snapshot of compliance scores after
  every evaluation run. This enables trend analysis, reporting, and charting of
  compliance posture over time.

  ## New Tables

  ### compliance_score_history
  Stores one row per evaluation run per account, capturing the aggregate compliance
  scores at the moment the evaluation completed.

  Columns:
  - `id` - UUID primary key
  - `account_id` - FK to linode_accounts (CASCADE delete)
  - `evaluated_at` - exact timestamp of the evaluation run
  - `total_results` - total number of results evaluated (excluding acknowledged)
  - `compliant_count` - number of compliant results (excluding acknowledged)
  - `non_compliant_count` - number of non-compliant results (excluding acknowledged)
  - `not_applicable_count` - number of not-applicable results (excluding acknowledged)
  - `acknowledged_count` - number of acknowledged results
  - `compliance_score` - percentage score: compliant / (compliant + non_compliant) * 100
    NULL if no scoreable results exist
  - `total_rules_evaluated` - number of active rules that ran
  - `rule_breakdown` - JSONB array with per-rule summary:
    [{ rule_id, rule_name, severity, compliant, non_compliant, not_applicable }]
  - `created_at` - record creation timestamp

  ## Indexes
  - `idx_compliance_score_history_account_id` on account_id
  - `idx_compliance_score_history_evaluated_at` on evaluated_at DESC
  - Composite index on (account_id, evaluated_at DESC) for efficient time-series queries

  ## Security
  - RLS enabled with restrictive policies
  - Only authenticated users who own the account can read history
  - Inserts are service-role only (evaluation runs from backend logic)
*/

CREATE TABLE IF NOT EXISTS compliance_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  total_results integer NOT NULL DEFAULT 0,
  compliant_count integer NOT NULL DEFAULT 0,
  non_compliant_count integer NOT NULL DEFAULT 0,
  not_applicable_count integer NOT NULL DEFAULT 0,
  acknowledged_count integer NOT NULL DEFAULT 0,
  compliance_score numeric(5,2),
  total_rules_evaluated integer NOT NULL DEFAULT 0,
  rule_breakdown jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_id
  ON compliance_score_history(account_id);

CREATE INDEX IF NOT EXISTS idx_compliance_score_history_evaluated_at
  ON compliance_score_history(evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_evaluated
  ON compliance_score_history(account_id, evaluated_at DESC);

ALTER TABLE compliance_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read score history for their accounts"
  ON compliance_score_history
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM linode_accounts
      WHERE linode_accounts.id = compliance_score_history.account_id
    )
  );

CREATE POLICY "Service role can insert score history"
  ON compliance_score_history
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM linode_accounts
      WHERE linode_accounts.id = compliance_score_history.account_id
    )
  );
