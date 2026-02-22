/*
  # Fix Indexes and Duplicate RLS Policies

  ## Summary
  Addresses multiple security and performance advisories:

  1. Missing indexes on foreign key columns (4 tables)
  2. Unused indexes dropped (12 indexes)
  3. Duplicate permissive SELECT policies for authenticated role (20 tables)
     - The "Authenticated users can select ..." policies used USING (true) which bypassed
       the proper scoped "Authenticated users can read ..." policies — the true policy
       made the restrictive one redundant. We keep the restrictive "read" policy and
       drop the always-true "select" duplicates.
  4. linode_types_cache INSERT/UPDATE/DELETE policies tightened to admin-only
     (previously USING(true) allowed any authenticated user to mutate shared cache data)

  ## Changes

  ### New Indexes
  - compliance_result_notes(compliance_result_id)
  - compliance_results(resource_id)
  - compliance_results(rule_id)
  - resource_compliance_history(resource_id)

  ### Dropped Unused Indexes
  - idx_aro_applied_by_profile_id, idx_aro_rule_id (account_rule_overrides)
  - idx_acp_account_id, idx_acp_profile_id (account_compliance_profiles)
  - idx_recommendations_resource_id (recommendations)
  - idx_budget_alerts_account_id (budget_alerts)
  - idx_cost_history_account_id, idx_cost_history_resource_id (cost_history)
  - idx_cr_acknowledged_by (compliance_results)
  - idx_uaa_account_id, idx_uaa_granted_by (user_account_access)
  - idx_crn_created_by (compliance_result_notes)

  ### Duplicate SELECT Policies Removed
  The always-true "can select" policies are dropped; the scoped "can read" policies remain.

  ### linode_types_cache Mutations Restricted to Admins
*/

-- ============================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_crn_compliance_result_id
  ON public.compliance_result_notes(compliance_result_id);

CREATE INDEX IF NOT EXISTS idx_cr_resource_id
  ON public.compliance_results(resource_id);

CREATE INDEX IF NOT EXISTS idx_cr_rule_id
  ON public.compliance_results(rule_id);

CREATE INDEX IF NOT EXISTS idx_rch_resource_id
  ON public.resource_compliance_history(resource_id);

-- ============================================================
-- 2. DROP UNUSED INDEXES
-- ============================================================

DROP INDEX IF EXISTS public.idx_aro_applied_by_profile_id;
DROP INDEX IF EXISTS public.idx_aro_rule_id;
DROP INDEX IF EXISTS public.idx_acp_account_id;
DROP INDEX IF EXISTS public.idx_acp_profile_id;
DROP INDEX IF EXISTS public.idx_recommendations_resource_id;
DROP INDEX IF EXISTS public.idx_budget_alerts_account_id;
DROP INDEX IF EXISTS public.idx_cost_history_account_id;
DROP INDEX IF EXISTS public.idx_cost_history_resource_id;
DROP INDEX IF EXISTS public.idx_cr_acknowledged_by;
DROP INDEX IF EXISTS public.idx_uaa_account_id;
DROP INDEX IF EXISTS public.idx_uaa_granted_by;
DROP INDEX IF EXISTS public.idx_crn_created_by;

-- ============================================================
-- 3. DROP DUPLICATE ALWAYS-TRUE SELECT POLICIES
--    (keep the scoped "read" policies, drop the "select" ones)
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can select account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can select account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Authenticated users can read ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Authenticated users can select budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can read compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can select compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can select compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Authenticated users can read compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Authenticated users can select compliance_score_history" ON public.compliance_score_history;
DROP POLICY IF EXISTS "Authenticated users can select cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Authenticated users can select cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Authenticated users can select linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Authenticated users can select linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Authenticated users can read linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can select metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Authenticated users can read profile_prompts" ON public.profile_prompts;
DROP POLICY IF EXISTS "Authenticated users can select recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Authenticated users can read resource compliance history" ON public.resource_compliance_history;
DROP POLICY IF EXISTS "Authenticated users can select resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Authenticated users can select resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Authenticated users can select resources" ON public.resources;

-- ai_config: the "read" policy was the always-true one; the "select" is correctly scoped — swap
-- Actually both were true for ai_config; rename the remaining one to be clear
-- (already dropped "read ai_config" above; "select ai_config" remains with USING(true))
-- ai_config is global config so all authenticated users reading it is acceptable,
-- but we need exactly ONE policy. Recreate a single clean one:
DROP POLICY IF EXISTS "Authenticated users can select ai_config" ON public.ai_config;
CREATE POLICY "Authenticated users can read ai_config"
  ON public.ai_config FOR SELECT
  TO authenticated
  USING (true);

-- compliance_profiles: same situation — global lookup table
DROP POLICY IF EXISTS "Authenticated users can select compliance_profiles" ON public.compliance_profiles;
CREATE POLICY "Authenticated users can read compliance_profiles"
  ON public.compliance_profiles FOR SELECT
  TO authenticated
  USING (true);

-- compliance_rules: global lookup table
DROP POLICY IF EXISTS "Authenticated users can select compliance_rules" ON public.compliance_rules;
CREATE POLICY "Authenticated users can read compliance_rules"
  ON public.compliance_rules FOR SELECT
  TO authenticated
  USING (true);

-- profile_prompts: global lookup table
DROP POLICY IF EXISTS "Authenticated users can select profile_prompts" ON public.profile_prompts;
CREATE POLICY "Authenticated users can read profile_prompts"
  ON public.profile_prompts FOR SELECT
  TO authenticated
  USING (true);

-- linode_types_cache: global lookup table (read ok for all authenticated)
CREATE POLICY "Authenticated users can read linode_types_cache"
  ON public.linode_types_cache FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 4. FIX linode_types_cache MUTATION POLICIES (always-true -> admin only)
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can write linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can update linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can delete linode_types_cache" ON public.linode_types_cache;

CREATE POLICY "Admins can insert linode_types_cache"
  ON public.linode_types_cache FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update linode_types_cache"
  ON public.linode_types_cache FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete linode_types_cache"
  ON public.linode_types_cache FOR DELETE
  TO authenticated
  USING (public.is_admin());
