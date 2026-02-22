/*
  # Add indexes for unindexed foreign keys

  Creates covering indexes on all foreign key columns that lack them.
  This improves JOIN and cascade performance.

  ## New indexes
  - account_compliance_profiles: account_id, profile_id
  - account_rule_overrides: applied_by_profile_id, rule_id
  - budget_alerts: account_id
  - compliance_result_notes: created_by
  - compliance_results: acknowledged_by
  - cost_history: account_id, resource_id
  - recommendations: resource_id
  - user_account_access: account_id, granted_by
*/

CREATE INDEX IF NOT EXISTS idx_acp_account_id ON public.account_compliance_profiles (account_id);
CREATE INDEX IF NOT EXISTS idx_acp_profile_id ON public.account_compliance_profiles (profile_id);

CREATE INDEX IF NOT EXISTS idx_aro_applied_by_profile_id ON public.account_rule_overrides (applied_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_aro_rule_id ON public.account_rule_overrides (rule_id);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_account_id ON public.budget_alerts (account_id);

CREATE INDEX IF NOT EXISTS idx_crn_created_by ON public.compliance_result_notes (created_by);

CREATE INDEX IF NOT EXISTS idx_cr_acknowledged_by ON public.compliance_results (acknowledged_by);

CREATE INDEX IF NOT EXISTS idx_cost_history_account_id ON public.cost_history (account_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_resource_id ON public.cost_history (resource_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_resource_id ON public.recommendations (resource_id);

CREATE INDEX IF NOT EXISTS idx_uaa_account_id ON public.user_account_access (account_id);
CREATE INDEX IF NOT EXISTS idx_uaa_granted_by ON public.user_account_access (granted_by);
