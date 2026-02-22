/*
  # Drop unused indexes

  The following indexes have never been used and add unnecessary write overhead.
  Dropping them improves INSERT/UPDATE performance on these tables.

  ## Dropped indexes
  - idx_resources_resource_type (resources)
  - idx_compliance_results_rule_id (compliance_results)
  - idx_compliance_results_resource_id (compliance_results)
  - idx_compliance_results_status (compliance_results)
  - idx_compliance_results_acknowledged (compliance_results)
  - idx_linode_events_entity_type (linode_events)
  - idx_linode_events_action (linode_events)
  - idx_compliance_score_history_account_id (compliance_score_history)
  - idx_compliance_score_history_evaluated_at (compliance_score_history)
  - idx_rch_resource_id (resource_compliance_history)
  - idx_rch_evaluated_at (resource_compliance_history)
  - idx_compliance_result_notes_result_id (compliance_result_notes)
*/

DROP INDEX IF EXISTS public.idx_resources_resource_type;
DROP INDEX IF EXISTS public.idx_compliance_results_rule_id;
DROP INDEX IF EXISTS public.idx_compliance_results_resource_id;
DROP INDEX IF EXISTS public.idx_compliance_results_status;
DROP INDEX IF EXISTS public.idx_compliance_results_acknowledged;
DROP INDEX IF EXISTS public.idx_linode_events_entity_type;
DROP INDEX IF EXISTS public.idx_linode_events_action;
DROP INDEX IF EXISTS public.idx_compliance_score_history_account_id;
DROP INDEX IF EXISTS public.idx_compliance_score_history_evaluated_at;
DROP INDEX IF EXISTS public.idx_rch_resource_id;
DROP INDEX IF EXISTS public.idx_rch_evaluated_at;
DROP INDEX IF EXISTS public.idx_compliance_result_notes_result_id;
