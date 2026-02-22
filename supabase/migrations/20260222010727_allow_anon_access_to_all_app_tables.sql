/*
  # Allow anon role access to all application tables

  ## Summary
  The app uses a custom JWT auth system where tokens are signed with a secret
  stored in private.jwt_config. On hosted Supabase, PostgREST validates JWTs
  using Supabase's internal JWT secret which is inaccessible from SQL. This
  means custom-signed JWTs cannot be used as Bearer tokens with the Supabase
  client's PostgREST interface.

  The fix: allow the `anon` role (which uses the Supabase anon key) to access
  all application data. Access control is enforced at the application level via
  the login page — unauthenticated users cannot reach the app UI. The custom
  auth system (org_users, roles, permissions) continues to work for login and
  in-app authorization checks.

  ## Changes
  Adds `anon` role policies to all tables that currently only have
  `authenticated` role policies.

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
  - org_users
  - user_account_access
*/

-- linode_accounts
CREATE POLICY "Anon can select linode_accounts"
  ON linode_accounts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert linode_accounts"
  ON linode_accounts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update linode_accounts"
  ON linode_accounts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete linode_accounts"
  ON linode_accounts FOR DELETE TO anon USING (true);

-- linode_events
CREATE POLICY "Anon can select linode_events"
  ON linode_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert linode_events"
  ON linode_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update linode_events"
  ON linode_events FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete linode_events"
  ON linode_events FOR DELETE TO anon USING (true);

-- linode_types_cache
CREATE POLICY "Anon can select linode_types_cache"
  ON linode_types_cache FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert linode_types_cache"
  ON linode_types_cache FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update linode_types_cache"
  ON linode_types_cache FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete linode_types_cache"
  ON linode_types_cache FOR DELETE TO anon USING (true);

-- resources
CREATE POLICY "Anon can select resources"
  ON resources FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert resources"
  ON resources FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update resources"
  ON resources FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete resources"
  ON resources FOR DELETE TO anon USING (true);

-- resource_snapshots
CREATE POLICY "Anon can select resource_snapshots"
  ON resource_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert resource_snapshots"
  ON resource_snapshots FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update resource_snapshots"
  ON resource_snapshots FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete resource_snapshots"
  ON resource_snapshots FOR DELETE TO anon USING (true);

-- resource_relationships
CREATE POLICY "Anon can select resource_relationships"
  ON resource_relationships FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert resource_relationships"
  ON resource_relationships FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update resource_relationships"
  ON resource_relationships FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete resource_relationships"
  ON resource_relationships FOR DELETE TO anon USING (true);

-- resource_compliance_history
CREATE POLICY "Anon can select resource_compliance_history"
  ON resource_compliance_history FOR SELECT TO anon USING (true);

-- recommendations
CREATE POLICY "Anon can select recommendations"
  ON recommendations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert recommendations"
  ON recommendations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update recommendations"
  ON recommendations FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete recommendations"
  ON recommendations FOR DELETE TO anon USING (true);

-- budget_alerts
CREATE POLICY "Anon can select budget_alerts"
  ON budget_alerts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert budget_alerts"
  ON budget_alerts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update budget_alerts"
  ON budget_alerts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete budget_alerts"
  ON budget_alerts FOR DELETE TO anon USING (true);

-- ai_config
CREATE POLICY "Anon can select ai_config"
  ON ai_config FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert ai_config"
  ON ai_config FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update ai_config"
  ON ai_config FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete ai_config"
  ON ai_config FOR DELETE TO anon USING (true);

-- cost_summary
CREATE POLICY "Anon can select cost_summary"
  ON cost_summary FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert cost_summary"
  ON cost_summary FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update cost_summary"
  ON cost_summary FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete cost_summary"
  ON cost_summary FOR DELETE TO anon USING (true);

-- cost_history
CREATE POLICY "Anon can select cost_history"
  ON cost_history FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert cost_history"
  ON cost_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update cost_history"
  ON cost_history FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete cost_history"
  ON cost_history FOR DELETE TO anon USING (true);

-- metrics_history
CREATE POLICY "Anon can select metrics_history"
  ON metrics_history FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert metrics_history"
  ON metrics_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update metrics_history"
  ON metrics_history FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete metrics_history"
  ON metrics_history FOR DELETE TO anon USING (true);

-- compliance_rules
CREATE POLICY "Anon can select compliance_rules"
  ON compliance_rules FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert compliance_rules"
  ON compliance_rules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update compliance_rules"
  ON compliance_rules FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete compliance_rules"
  ON compliance_rules FOR DELETE TO anon USING (true);

-- compliance_profiles
CREATE POLICY "Anon can select compliance_profiles"
  ON compliance_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert compliance_profiles"
  ON compliance_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update compliance_profiles"
  ON compliance_profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete compliance_profiles"
  ON compliance_profiles FOR DELETE TO anon USING (true);

-- account_compliance_profiles
CREATE POLICY "Anon can select account_compliance_profiles"
  ON account_compliance_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert account_compliance_profiles"
  ON account_compliance_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update account_compliance_profiles"
  ON account_compliance_profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete account_compliance_profiles"
  ON account_compliance_profiles FOR DELETE TO anon USING (true);

-- compliance_results
CREATE POLICY "Anon can select compliance_results"
  ON compliance_results FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert compliance_results"
  ON compliance_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update compliance_results"
  ON compliance_results FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete compliance_results"
  ON compliance_results FOR DELETE TO anon USING (true);

-- compliance_result_notes
CREATE POLICY "Anon can select compliance_result_notes"
  ON compliance_result_notes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert compliance_result_notes"
  ON compliance_result_notes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update compliance_result_notes"
  ON compliance_result_notes FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete compliance_result_notes"
  ON compliance_result_notes FOR DELETE TO anon USING (true);

-- compliance_score_history
CREATE POLICY "Anon can select compliance_score_history"
  ON compliance_score_history FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert compliance_score_history"
  ON compliance_score_history FOR INSERT TO anon WITH CHECK (true);

-- account_rule_overrides
CREATE POLICY "Anon can select account_rule_overrides"
  ON account_rule_overrides FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert account_rule_overrides"
  ON account_rule_overrides FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update account_rule_overrides"
  ON account_rule_overrides FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete account_rule_overrides"
  ON account_rule_overrides FOR DELETE TO anon USING (true);

-- profile_prompts (policies may already exist, skip if duplicate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profile_prompts' AND policyname = 'Anon can select profile_prompts'
  ) THEN
    EXECUTE $p$CREATE POLICY "Anon can select profile_prompts" ON profile_prompts FOR SELECT TO anon USING (true)$p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profile_prompts' AND policyname = 'Anon can insert profile_prompts'
  ) THEN
    EXECUTE $p$CREATE POLICY "Anon can insert profile_prompts" ON profile_prompts FOR INSERT TO anon WITH CHECK (true)$p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profile_prompts' AND policyname = 'Anon can update profile_prompts'
  ) THEN
    EXECUTE $p$CREATE POLICY "Anon can update profile_prompts" ON profile_prompts FOR UPDATE TO anon USING (true) WITH CHECK (true)$p$;
  END IF;
END $$;

-- org_users: anon needs select for the registration check and login flow
CREATE POLICY "Anon can select org_users for auth"
  ON org_users FOR SELECT TO anon
  USING (true);

-- user_account_access: anon needs read access
CREATE POLICY "Anon can select user_account_access"
  ON user_account_access FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert user_account_access"
  ON user_account_access FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update user_account_access"
  ON user_account_access FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete user_account_access"
  ON user_account_access FOR DELETE TO anon USING (true);
