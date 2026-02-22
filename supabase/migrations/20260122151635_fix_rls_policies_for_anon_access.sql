/*
  # Fix RLS Policies for Anonymous Access
  
  1. Changes
    - Drop existing restrictive policies
    - Create permissive policies that allow anon role access
    - Enable single-user mode without authentication
    
  2. Security
    - Allows both anon and authenticated roles
    - Suitable for single-user self-hosted deployment
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can manage linode accounts" ON linode_accounts;
DROP POLICY IF EXISTS "Authenticated users can view resources" ON resources;
DROP POLICY IF EXISTS "Authenticated users can insert resources" ON resources;
DROP POLICY IF EXISTS "Authenticated users can update resources" ON resources;
DROP POLICY IF EXISTS "Authenticated users can delete resources" ON resources;
DROP POLICY IF EXISTS "Authenticated users can view recommendations" ON recommendations;
DROP POLICY IF EXISTS "Authenticated users can insert recommendations" ON recommendations;
DROP POLICY IF EXISTS "Authenticated users can update recommendations" ON recommendations;
DROP POLICY IF EXISTS "Authenticated users can view budget_alerts" ON budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can insert budget_alerts" ON budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can update budget_alerts" ON budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can delete budget_alerts" ON budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can view metrics_history" ON metrics_history;
DROP POLICY IF EXISTS "Authenticated users can insert metrics_history" ON metrics_history;
DROP POLICY IF EXISTS "Authenticated users can view ai_config" ON ai_config;
DROP POLICY IF EXISTS "Authenticated users can insert ai_config" ON ai_config;
DROP POLICY IF EXISTS "Authenticated users can update ai_config" ON ai_config;
DROP POLICY IF EXISTS "Authenticated users can view cost summary" ON cost_summary;
DROP POLICY IF EXISTS "Authenticated users can insert cost summary" ON cost_summary;
DROP POLICY IF EXISTS "Authenticated users can update cost summary" ON cost_summary;

-- Create permissive policies for anon and authenticated users
CREATE POLICY "Allow all access to linode_accounts"
  ON linode_accounts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to resources"
  ON resources FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to recommendations"
  ON recommendations FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to budget_alerts"
  ON budget_alerts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to metrics_history"
  ON metrics_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to ai_config"
  ON ai_config FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to cost_summary"
  ON cost_summary FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
