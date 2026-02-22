/*
  # Add Missing Columns to Existing Schema

  1. Updates to Existing Tables
    - Add `last_sync_at` to linode_accounts
    - Add `plan_type` and `monthly_cost` to resources
    - Add `unit` to metrics_history
    - Add `status` field to recommendations
    - Add `title` and `description` fields to recommendations
    
  2. Note
    - Tables already exist from previous migration
    - This migration adds missing fields for full functionality
*/

-- Add missing columns to linode_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'linode_accounts' AND column_name = 'last_sync_at'
  ) THEN
    ALTER TABLE linode_accounts ADD COLUMN last_sync_at timestamptz;
  END IF;
END $$;

-- Add missing columns to resources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE resources ADD COLUMN plan_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'monthly_cost'
  ) THEN
    ALTER TABLE resources ADD COLUMN monthly_cost numeric DEFAULT 0;
  END IF;
END $$;

-- Add missing columns to metrics_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'metrics_history' AND column_name = 'unit'
  ) THEN
    ALTER TABLE metrics_history ADD COLUMN unit text;
  END IF;
END $$;

-- Add missing columns to recommendations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'status'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN status text DEFAULT 'active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'title'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'description'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'potential_savings'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN potential_savings numeric DEFAULT 0;
  END IF;
END $$;

-- Add missing columns to budget_alerts (rename to budgets concept)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_alerts' AND column_name = 'name'
  ) THEN
    ALTER TABLE budget_alerts ADD COLUMN name text DEFAULT 'Default Budget';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_alerts' AND column_name = 'monthly_limit'
  ) THEN
    ALTER TABLE budget_alerts ADD COLUMN monthly_limit numeric;
  END IF;
END $$;

-- Update budget_alerts monthly_limit from budget_amount if null
UPDATE budget_alerts SET monthly_limit = budget_amount WHERE monthly_limit IS NULL;

-- Create a proper cost_summary table for daily totals
CREATE TABLE IF NOT EXISTS cost_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES linode_accounts(id) ON DELETE CASCADE NOT NULL,
  cost_date date NOT NULL,
  total_cost numeric NOT NULL,
  resource_breakdown jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_id, cost_date)
);

ALTER TABLE cost_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cost summary"
  ON cost_summary FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert cost summary"
  ON cost_summary FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cost summary"
  ON cost_summary FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cost_summary_account_date ON cost_summary(account_id, cost_date DESC);