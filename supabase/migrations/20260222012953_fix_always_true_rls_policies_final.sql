/*
  # Fix always-true RLS policies on all app tables (final)

  Replaces USING(true)/WITH CHECK(true) with proper ownership checks.
  Removes all anon write access. Uses fully qualified column references.
  All tables verified to have correct column names before applying.
*/

-- ── resources ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete resources" ON public.resources;
DROP POLICY IF EXISTS "Anon can insert resources" ON public.resources;
DROP POLICY IF EXISTS "Anon can update resources" ON public.resources;
DROP POLICY IF EXISTS "Authenticated users can delete resources" ON public.resources;
DROP POLICY IF EXISTS "Authenticated users can insert resources" ON public.resources;
DROP POLICY IF EXISTS "Authenticated users can update resources" ON public.resources;
DROP POLICY IF EXISTS "Anon can read resources" ON public.resources;
DROP POLICY IF EXISTS "Authenticated users can read resources" ON public.resources;

CREATE POLICY "Authenticated users can read resources" ON public.resources FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resources.account_id));
CREATE POLICY "Authenticated users can insert resources" ON public.resources FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resources.account_id));
CREATE POLICY "Authenticated users can update resources" ON public.resources FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resources.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resources.account_id));
CREATE POLICY "Authenticated users can delete resources" ON public.resources FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resources.account_id));

-- ── cost_history ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Anon can insert cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Anon can update cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Authenticated users can delete cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Authenticated users can insert cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Authenticated users can update cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Anon can read cost_history" ON public.cost_history;
DROP POLICY IF EXISTS "Authenticated users can read cost_history" ON public.cost_history;

CREATE POLICY "Authenticated users can read cost_history" ON public.cost_history FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_history.account_id));
CREATE POLICY "Authenticated users can insert cost_history" ON public.cost_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_history.account_id));
CREATE POLICY "Authenticated users can update cost_history" ON public.cost_history FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_history.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_history.account_id));
CREATE POLICY "Authenticated users can delete cost_history" ON public.cost_history FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_history.account_id));

-- ── cost_summary ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Anon can insert cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Anon can update cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Authenticated users can delete cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Authenticated users can insert cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Authenticated users can update cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Anon can read cost_summary" ON public.cost_summary;
DROP POLICY IF EXISTS "Authenticated users can read cost_summary" ON public.cost_summary;

CREATE POLICY "Authenticated users can read cost_summary" ON public.cost_summary FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_summary.account_id));
CREATE POLICY "Authenticated users can insert cost_summary" ON public.cost_summary FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_summary.account_id));
CREATE POLICY "Authenticated users can update cost_summary" ON public.cost_summary FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_summary.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_summary.account_id));
CREATE POLICY "Authenticated users can delete cost_summary" ON public.cost_summary FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = cost_summary.account_id));

-- ── recommendations ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Anon can insert recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Anon can update recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Authenticated users can delete recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Authenticated users can insert recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Authenticated users can update recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Anon can read recommendations" ON public.recommendations;
DROP POLICY IF EXISTS "Authenticated users can read recommendations" ON public.recommendations;

CREATE POLICY "Authenticated users can read recommendations" ON public.recommendations FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = recommendations.resource_id AND uaa.user_id = (select auth.uid())));
CREATE POLICY "Authenticated users can insert recommendations" ON public.recommendations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = recommendations.resource_id AND uaa.user_id = (select auth.uid())));
CREATE POLICY "Authenticated users can update recommendations" ON public.recommendations FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = recommendations.resource_id AND uaa.user_id = (select auth.uid())))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = recommendations.resource_id AND uaa.user_id = (select auth.uid())));
CREATE POLICY "Authenticated users can delete recommendations" ON public.recommendations FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = recommendations.resource_id AND uaa.user_id = (select auth.uid())));

-- ── metrics_history ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Anon can insert metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Anon can update metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Authenticated users can delete metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Authenticated users can insert metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Authenticated users can update metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Anon can read metrics_history" ON public.metrics_history;
DROP POLICY IF EXISTS "Authenticated users can read metrics_history" ON public.metrics_history;

CREATE POLICY "Authenticated users can read metrics_history" ON public.metrics_history FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = metrics_history.resource_id AND uaa.user_id = (select auth.uid())));
CREATE POLICY "Authenticated users can insert metrics_history" ON public.metrics_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = metrics_history.resource_id AND uaa.user_id = (select auth.uid())));
CREATE POLICY "Authenticated users can update metrics_history" ON public.metrics_history FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = metrics_history.resource_id AND uaa.user_id = (select auth.uid())))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = metrics_history.resource_id AND uaa.user_id = (select auth.uid())));
CREATE POLICY "Authenticated users can delete metrics_history" ON public.metrics_history FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.resources r JOIN public.user_account_access uaa ON uaa.account_id = r.account_id WHERE r.id = metrics_history.resource_id AND uaa.user_id = (select auth.uid())));

-- ── linode_accounts ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Anon can insert linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Anon can update linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Authenticated users can update linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Anon can read linode_accounts" ON public.linode_accounts;
DROP POLICY IF EXISTS "Authenticated users can read linode_accounts" ON public.linode_accounts;

CREATE POLICY "Authenticated users can read linode_accounts" ON public.linode_accounts FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = linode_accounts.id));
CREATE POLICY "Authenticated users can insert linode_accounts" ON public.linode_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated users can update linode_accounts" ON public.linode_accounts FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Authenticated users can delete linode_accounts" ON public.linode_accounts FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── linode_events ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Anon can insert linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Anon can update linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Authenticated users can delete linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Authenticated users can insert linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Authenticated users can update linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Anon can read linode_events" ON public.linode_events;
DROP POLICY IF EXISTS "Authenticated users can read linode_events" ON public.linode_events;

CREATE POLICY "Authenticated users can read linode_events" ON public.linode_events FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = linode_events.account_id));
CREATE POLICY "Authenticated users can insert linode_events" ON public.linode_events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = linode_events.account_id));
CREATE POLICY "Authenticated users can update linode_events" ON public.linode_events FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = linode_events.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = linode_events.account_id));
CREATE POLICY "Authenticated users can delete linode_events" ON public.linode_events FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = linode_events.account_id));

-- ── resource_snapshots ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Anon can insert resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Anon can update resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Authenticated users can delete resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Authenticated users can insert resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Authenticated users can update resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Anon can read resource_snapshots" ON public.resource_snapshots;
DROP POLICY IF EXISTS "Authenticated users can read resource_snapshots" ON public.resource_snapshots;

CREATE POLICY "Authenticated users can read resource_snapshots" ON public.resource_snapshots FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_snapshots.account_id));
CREATE POLICY "Authenticated users can insert resource_snapshots" ON public.resource_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_snapshots.account_id));
CREATE POLICY "Authenticated users can update resource_snapshots" ON public.resource_snapshots FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_snapshots.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_snapshots.account_id));
CREATE POLICY "Authenticated users can delete resource_snapshots" ON public.resource_snapshots FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_snapshots.account_id));

-- ── resource_relationships (has account_id directly) ──────────────────────────
DROP POLICY IF EXISTS "Anon can delete resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Anon can insert resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Anon can update resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Authenticated users can delete resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Authenticated users can insert resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Authenticated users can update resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Anon can read resource_relationships" ON public.resource_relationships;
DROP POLICY IF EXISTS "Authenticated users can read resource_relationships" ON public.resource_relationships;

CREATE POLICY "Authenticated users can read resource_relationships" ON public.resource_relationships FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_relationships.account_id));
CREATE POLICY "Authenticated users can insert resource_relationships" ON public.resource_relationships FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_relationships.account_id));
CREATE POLICY "Authenticated users can update resource_relationships" ON public.resource_relationships FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_relationships.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_relationships.account_id));
CREATE POLICY "Authenticated users can delete resource_relationships" ON public.resource_relationships FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_relationships.account_id));

-- ── linode_types_cache (reference table) ──────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Anon can insert linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Anon can update linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can delete linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can insert linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can update linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Anon can read linode_types_cache" ON public.linode_types_cache;
DROP POLICY IF EXISTS "Authenticated users can read linode_types_cache" ON public.linode_types_cache;

CREATE POLICY "Authenticated users can read linode_types_cache" ON public.linode_types_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write linode_types_cache" ON public.linode_types_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update linode_types_cache" ON public.linode_types_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete linode_types_cache" ON public.linode_types_cache FOR DELETE TO authenticated USING (true);

-- ── budget_alerts ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Anon can insert budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Anon can update budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can delete budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can insert budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can update budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Anon can read budget_alerts" ON public.budget_alerts;
DROP POLICY IF EXISTS "Authenticated users can read budget_alerts" ON public.budget_alerts;

CREATE POLICY "Authenticated users can read budget_alerts" ON public.budget_alerts FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = budget_alerts.account_id));
CREATE POLICY "Authenticated users can insert budget_alerts" ON public.budget_alerts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = budget_alerts.account_id));
CREATE POLICY "Authenticated users can update budget_alerts" ON public.budget_alerts FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = budget_alerts.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = budget_alerts.account_id));
CREATE POLICY "Authenticated users can delete budget_alerts" ON public.budget_alerts FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = budget_alerts.account_id));

-- ── ai_config (global singleton) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Anon can insert ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Anon can update ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Authenticated users can delete ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Authenticated users can insert ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Authenticated users can update ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Anon can read ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Authenticated users can read ai_config" ON public.ai_config;

CREATE POLICY "Authenticated users can read ai_config" ON public.ai_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert ai_config" ON public.ai_config FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update ai_config" ON public.ai_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete ai_config" ON public.ai_config FOR DELETE TO authenticated USING (public.is_admin());

-- ── compliance_rules (global reference) ───────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Anon can insert compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Anon can update compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Authenticated users can delete compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Authenticated users can insert compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Authenticated users can update compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Anon can read compliance_rules" ON public.compliance_rules;
DROP POLICY IF EXISTS "Authenticated users can read compliance_rules" ON public.compliance_rules;

CREATE POLICY "Authenticated users can read compliance_rules" ON public.compliance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert compliance_rules" ON public.compliance_rules FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update compliance_rules" ON public.compliance_rules FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete compliance_rules" ON public.compliance_rules FOR DELETE TO authenticated USING (public.is_admin());

-- ── compliance_profiles (global reference) ────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Anon can insert compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Anon can update compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can delete compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can insert compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can update compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Anon can read compliance_profiles" ON public.compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can read compliance_profiles" ON public.compliance_profiles;

CREATE POLICY "Authenticated users can read compliance_profiles" ON public.compliance_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert compliance_profiles" ON public.compliance_profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update compliance_profiles" ON public.compliance_profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete compliance_profiles" ON public.compliance_profiles FOR DELETE TO authenticated USING (public.is_admin());

-- ── account_compliance_profiles ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Anon can insert account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Anon can update account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can delete account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can insert account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can update account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Anon can read account_compliance_profiles" ON public.account_compliance_profiles;
DROP POLICY IF EXISTS "Authenticated users can read account_compliance_profiles" ON public.account_compliance_profiles;

CREATE POLICY "Authenticated users can read account_compliance_profiles" ON public.account_compliance_profiles FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_compliance_profiles.account_id));
CREATE POLICY "Authenticated users can insert account_compliance_profiles" ON public.account_compliance_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_compliance_profiles.account_id));
CREATE POLICY "Authenticated users can update account_compliance_profiles" ON public.account_compliance_profiles FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_compliance_profiles.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_compliance_profiles.account_id));
CREATE POLICY "Authenticated users can delete account_compliance_profiles" ON public.account_compliance_profiles FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_compliance_profiles.account_id));

-- ── account_rule_overrides ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Anon can insert account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Anon can update account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Authenticated users can delete account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Authenticated users can insert account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Authenticated users can update account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Anon can read account_rule_overrides" ON public.account_rule_overrides;
DROP POLICY IF EXISTS "Authenticated users can read account_rule_overrides" ON public.account_rule_overrides;

CREATE POLICY "Authenticated users can read account_rule_overrides" ON public.account_rule_overrides FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_rule_overrides.account_id));
CREATE POLICY "Authenticated users can insert account_rule_overrides" ON public.account_rule_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_rule_overrides.account_id));
CREATE POLICY "Authenticated users can update account_rule_overrides" ON public.account_rule_overrides FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_rule_overrides.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_rule_overrides.account_id));
CREATE POLICY "Authenticated users can delete account_rule_overrides" ON public.account_rule_overrides FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = account_rule_overrides.account_id));

-- ── compliance_results ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can delete compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Anon can insert compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Anon can update compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Authenticated users can delete compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Authenticated users can insert compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Authenticated users can update compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Anon can read compliance_results" ON public.compliance_results;
DROP POLICY IF EXISTS "Authenticated users can read compliance_results" ON public.compliance_results;

CREATE POLICY "Authenticated users can read compliance_results" ON public.compliance_results FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_results.account_id));
CREATE POLICY "Authenticated users can insert compliance_results" ON public.compliance_results FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_results.account_id));
CREATE POLICY "Authenticated users can update compliance_results" ON public.compliance_results FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_results.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_results.account_id));
CREATE POLICY "Authenticated users can delete compliance_results" ON public.compliance_results FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_results.account_id));

-- ── compliance_result_notes (has account_id directly) ─────────────────────────
DROP POLICY IF EXISTS "Anon can delete compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Anon can insert compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Anon can update compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can delete compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can insert compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can update compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Anon can read compliance_result_notes" ON public.compliance_result_notes;
DROP POLICY IF EXISTS "Authenticated users can read compliance_result_notes" ON public.compliance_result_notes;

CREATE POLICY "Authenticated users can read compliance_result_notes" ON public.compliance_result_notes FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_result_notes.account_id));
CREATE POLICY "Authenticated users can insert compliance_result_notes" ON public.compliance_result_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_result_notes.account_id));
CREATE POLICY "Authenticated users can update compliance_result_notes" ON public.compliance_result_notes FOR UPDATE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_result_notes.account_id))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_result_notes.account_id));
CREATE POLICY "Authenticated users can delete compliance_result_notes" ON public.compliance_result_notes FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_result_notes.account_id));

-- ── compliance_score_history ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can insert compliance_score_history" ON public.compliance_score_history;
DROP POLICY IF EXISTS "Authenticated users can insert compliance_score_history" ON public.compliance_score_history;
DROP POLICY IF EXISTS "Anon can read compliance_score_history" ON public.compliance_score_history;
DROP POLICY IF EXISTS "Authenticated users can read compliance_score_history" ON public.compliance_score_history;

CREATE POLICY "Authenticated users can read compliance_score_history" ON public.compliance_score_history FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_score_history.account_id));
CREATE POLICY "Authenticated users can insert compliance_score_history" ON public.compliance_score_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = compliance_score_history.account_id));

-- ── resource_compliance_history (has account_id directly) ─────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert resource compliance history" ON public.resource_compliance_history;
DROP POLICY IF EXISTS "Anon can read resource_compliance_history" ON public.resource_compliance_history;
DROP POLICY IF EXISTS "Authenticated users can read resource_compliance_history" ON public.resource_compliance_history;

CREATE POLICY "Authenticated users can read resource_compliance_history" ON public.resource_compliance_history FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_compliance_history.account_id));
CREATE POLICY "Authenticated users can insert resource_compliance_history" ON public.resource_compliance_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_account_access uaa WHERE uaa.user_id = (select auth.uid()) AND uaa.account_id = resource_compliance_history.account_id));

-- ── profile_prompts (global reference) ───────────────────────────────────────
DROP POLICY IF EXISTS "Anon can insert profile_prompts" ON public.profile_prompts;
DROP POLICY IF EXISTS "Anon can update profile_prompts" ON public.profile_prompts;
DROP POLICY IF EXISTS "Authenticated users can insert profile_prompts" ON public.profile_prompts;
DROP POLICY IF EXISTS "Authenticated users can update profile_prompts" ON public.profile_prompts;
DROP POLICY IF EXISTS "Anon can read profile_prompts" ON public.profile_prompts;
DROP POLICY IF EXISTS "Authenticated users can read profile_prompts" ON public.profile_prompts;

CREATE POLICY "Authenticated users can read profile_prompts" ON public.profile_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert profile_prompts" ON public.profile_prompts FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update profile_prompts" ON public.profile_prompts FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
