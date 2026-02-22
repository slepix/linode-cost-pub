
/*
  # Add savings_profile to ai_config

  ## Summary
  Adds a savings_profile column to the ai_config table to control how
  aggressively the AI recommends cost-saving changes.

  ## Changes
  - `ai_config` table:
    - New column `savings_profile` (text, default 'balanced')
      - 'relaxed'   — only recommend changes when utilization is very clearly off
      - 'balanced'  — default, moderate thresholds
      - 'aggressive' — recommend changes at lower utilization, maximizing savings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_config' AND column_name = 'savings_profile'
  ) THEN
    ALTER TABLE ai_config ADD COLUMN savings_profile text NOT NULL DEFAULT 'balanced';
  END IF;
END $$;
