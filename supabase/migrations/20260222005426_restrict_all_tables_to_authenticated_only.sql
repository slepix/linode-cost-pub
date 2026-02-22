/*
  # Restrict all tables to authenticated users only

  ## Summary
  Previously, nearly every table had RLS policies granting full access to both
  `anon` and `authenticated` roles with `USING (true)`. This allowed anyone with
  the public anon key to read and write all data without logging in.

  This migration drops all overly-permissive policies and replaces them with
  `authenticated`-only equivalents. The custom JWT auth flow sets `role = "authenticated"`
  in the JWT payload, so PostgREST will grant this role to logged-in app users.
  Anonymous API requests (raw curl with anon key) will be blocked.

  ## Tables affected
  - linode_accounts
  - linode_events
  - linode_types_cache
  - resources
  - resource_snapshots
  - resource_relationships
  - resource_compliance_history
  - recommendations
  - budget_alerts
  - ai_config
  - cost_summary
  - cost_history
  - metrics_history
  - compliance_rules
  - compliance_profiles
  - account_compliance_profiles
  - compliance_results
  - compliance_result_notes
  - compliance_score_history
  - account_rule_overrides
  - profile_prompts

  ## Security changes
  - All `anon` role access removed from sensitive data tables
  - All tables now require `authenticated` role (valid logged-in JWT)
  - The backend server uses the service role key and bypasses RLS entirely, so it is unaffected
  - The auth RPCs (auth_login, auth_register) are SECURITY DEFINER and run as superuser, so they are unaffected
*/

-- ============================================================
-- linode_accounts
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to linode_accounts" ON linode_accounts;

CREATE POLICY "Authenticated users can select linode_accounts"
  ON linode_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert linode_accounts"
  ON linode_accounts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update linode_accounts"
  ON linode_accounts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete linode_accounts"
  ON linode_accounts FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- linode_events
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select linode_events" ON linode_events;
DROP POLICY IF EXISTS "Anyone can insert linode_events" ON linode_events;
DROP POLICY IF EXISTS "Anyone can update linode_events" ON linode_events;
DROP POLICY IF EXISTS "Anyone can delete linode_events" ON linode_events;

CREATE POLICY "Authenticated users can select linode_events"
  ON linode_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert linode_events"
  ON linode_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update linode_events"
  ON linode_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete linode_events"
  ON linode_events FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- linode_types_cache
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read linode types cache" ON linode_types_cache;
DROP POLICY IF EXISTS "Anyone can insert linode types cache" ON linode_types_cache;
DROP POLICY IF EXISTS "Anyone can update linode types cache" ON linode_types_cache;
DROP POLICY IF EXISTS "Anyone can delete linode types cache" ON linode_types_cache;

CREATE POLICY "Authenticated users can select linode_types_cache"
  ON linode_types_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert linode_types_cache"
  ON linode_types_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update linode_types_cache"
  ON linode_types_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete linode_types_cache"
  ON linode_types_cache FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- resources
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to resources" ON resources;

CREATE POLICY "Authenticated users can select resources"
  ON resources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert resources"
  ON resources FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update resources"
  ON resources FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete resources"
  ON resources FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- resource_snapshots
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select resource_snapshots" ON resource_snapshots;
DROP POLICY IF EXISTS "Anyone can insert resource_snapshots" ON resource_snapshots;
DROP POLICY IF EXISTS "Anyone can update resource_snapshots" ON resource_snapshots;
DROP POLICY IF EXISTS "Anyone can delete resource_snapshots" ON resource_snapshots;

CREATE POLICY "Authenticated users can select resource_snapshots"
  ON resource_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert resource_snapshots"
  ON resource_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update resource_snapshots"
  ON resource_snapshots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete resource_snapshots"
  ON resource_snapshots FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- resource_relationships
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select resource_relationships" ON resource_relationships;
DROP POLICY IF EXISTS "Anyone can insert resource_relationships" ON resource_relationships;
DROP POLICY IF EXISTS "Anyone can update resource_relationships" ON resource_relationships;
DROP POLICY IF EXISTS "Anyone can delete resource_relationships" ON resource_relationships;

CREATE POLICY "Authenticated users can select resource_relationships"
  ON resource_relationships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert resource_relationships"
  ON resource_relationships FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update resource_relationships"
  ON resource_relationships FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete resource_relationships"
  ON resource_relationships FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- resource_compliance_history
-- ============================================================
DROP POLICY IF EXISTS "Anon can insert resource compliance history" ON resource_compliance_history;
DROP POLICY IF EXISTS "Anon can read resource compliance history" ON resource_compliance_history;

-- Keep the authenticated policies that already exist; they are correct.
-- (Authenticated users can insert resource compliance history)
-- (Authenticated users can read resource compliance history)

-- ============================================================
-- recommendations
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to recommendations" ON recommendations;

CREATE POLICY "Authenticated users can select recommendations"
  ON recommendations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert recommendations"
  ON recommendations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update recommendations"
  ON recommendations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete recommendations"
  ON recommendations FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- budget_alerts
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view budgets" ON budget_alerts;
DROP POLICY IF EXISTS "Anyone can insert budgets" ON budget_alerts;
DROP POLICY IF EXISTS "Anyone can update budgets" ON budget_alerts;
DROP POLICY IF EXISTS "Anyone can delete budgets" ON budget_alerts;

CREATE POLICY "Authenticated users can select budget_alerts"
  ON budget_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert budget_alerts"
  ON budget_alerts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update budget_alerts"
  ON budget_alerts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete budget_alerts"
  ON budget_alerts FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- ai_config
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to ai_config" ON ai_config;

CREATE POLICY "Authenticated users can select ai_config"
  ON ai_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert ai_config"
  ON ai_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update ai_config"
  ON ai_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete ai_config"
  ON ai_config FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- cost_summary
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to cost_summary" ON cost_summary;

CREATE POLICY "Authenticated users can select cost_summary"
  ON cost_summary FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert cost_summary"
  ON cost_summary FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cost_summary"
  ON cost_summary FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete cost_summary"
  ON cost_summary FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- cost_history
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to cost_history" ON cost_history;

CREATE POLICY "Authenticated users can select cost_history"
  ON cost_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert cost_history"
  ON cost_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cost_history"
  ON cost_history FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete cost_history"
  ON cost_history FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- metrics_history
-- ============================================================
DROP POLICY IF EXISTS "Allow all access to metrics_history" ON metrics_history;

CREATE POLICY "Authenticated users can select metrics_history"
  ON metrics_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert metrics_history"
  ON metrics_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update metrics_history"
  ON metrics_history FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete metrics_history"
  ON metrics_history FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- compliance_rules
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select compliance_rules" ON compliance_rules;
DROP POLICY IF EXISTS "Anyone can insert compliance_rules" ON compliance_rules;
DROP POLICY IF EXISTS "Anyone can update compliance_rules" ON compliance_rules;
DROP POLICY IF EXISTS "Anyone can delete compliance_rules" ON compliance_rules;

CREATE POLICY "Authenticated users can select compliance_rules"
  ON compliance_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance_rules"
  ON compliance_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update compliance_rules"
  ON compliance_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete compliance_rules"
  ON compliance_rules FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- compliance_profiles
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select compliance_profiles" ON compliance_profiles;
DROP POLICY IF EXISTS "Anyone can insert compliance_profiles" ON compliance_profiles;
DROP POLICY IF EXISTS "Anyone can update compliance_profiles" ON compliance_profiles;
DROP POLICY IF EXISTS "Anyone can delete compliance_profiles" ON compliance_profiles;

CREATE POLICY "Authenticated users can select compliance_profiles"
  ON compliance_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance_profiles"
  ON compliance_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update compliance_profiles"
  ON compliance_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete compliance_profiles"
  ON compliance_profiles FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- account_compliance_profiles
-- ============================================================
DROP POLICY IF EXISTS "Anyone can access account_compliance_profiles" ON account_compliance_profiles;

CREATE POLICY "Authenticated users can select account_compliance_profiles"
  ON account_compliance_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert account_compliance_profiles"
  ON account_compliance_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update account_compliance_profiles"
  ON account_compliance_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete account_compliance_profiles"
  ON account_compliance_profiles FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- compliance_results
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select compliance_results" ON compliance_results;
DROP POLICY IF EXISTS "Anyone can insert compliance_results" ON compliance_results;
DROP POLICY IF EXISTS "Anyone can update compliance_results" ON compliance_results;
DROP POLICY IF EXISTS "Anyone can delete compliance_results" ON compliance_results;

CREATE POLICY "Authenticated users can select compliance_results"
  ON compliance_results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance_results"
  ON compliance_results FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update compliance_results"
  ON compliance_results FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete compliance_results"
  ON compliance_results FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- compliance_result_notes
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view compliance result notes" ON compliance_result_notes;
DROP POLICY IF EXISTS "Anyone can insert compliance result notes" ON compliance_result_notes;
DROP POLICY IF EXISTS "Anyone can delete compliance result notes" ON compliance_result_notes;

CREATE POLICY "Authenticated users can select compliance_result_notes"
  ON compliance_result_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance_result_notes"
  ON compliance_result_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update compliance_result_notes"
  ON compliance_result_notes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete compliance_result_notes"
  ON compliance_result_notes FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- compliance_score_history
-- ============================================================
DROP POLICY IF EXISTS "Users can read score history" ON compliance_score_history;
DROP POLICY IF EXISTS "Users can insert score history" ON compliance_score_history;

CREATE POLICY "Authenticated users can select compliance_score_history"
  ON compliance_score_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance_score_history"
  ON compliance_score_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- account_rule_overrides
-- ============================================================
DROP POLICY IF EXISTS "Anyone can select account_rule_overrides" ON account_rule_overrides;
DROP POLICY IF EXISTS "Anyone can insert account_rule_overrides" ON account_rule_overrides;
DROP POLICY IF EXISTS "Anyone can update account_rule_overrides" ON account_rule_overrides;
DROP POLICY IF EXISTS "Anyone can delete account_rule_overrides" ON account_rule_overrides;

CREATE POLICY "Authenticated users can select account_rule_overrides"
  ON account_rule_overrides FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert account_rule_overrides"
  ON account_rule_overrides FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update account_rule_overrides"
  ON account_rule_overrides FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete account_rule_overrides"
  ON account_rule_overrides FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- profile_prompts
-- ============================================================
DROP POLICY IF EXISTS "Allow anon select on profile_prompts" ON profile_prompts;
DROP POLICY IF EXISTS "Allow anon insert on profile_prompts" ON profile_prompts;
DROP POLICY IF EXISTS "Allow anon update on profile_prompts" ON profile_prompts;

CREATE POLICY "Authenticated users can select profile_prompts"
  ON profile_prompts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert profile_prompts"
  ON profile_prompts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update profile_prompts"
  ON profile_prompts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
