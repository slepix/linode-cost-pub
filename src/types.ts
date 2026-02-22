export interface LinodeAccount {
  id: string;
  name: string;
  api_token: string;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
}

export interface Resource {
  id: string;
  account_id: string;
  resource_id: string;
  resource_type: string;
  label: string;
  region?: string;
  plan_type?: string;
  monthly_cost: number;
  status?: string;
  specs: any;
  pricing?: any;
  resource_created_at?: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
}

export interface MetricSnapshot {
  id: string;
  resource_id: string;
  metric_type: string;
  timestamp: string;
  value: number;
  unit?: string;
  created_at: string;
}

export interface CostSummary {
  id: string;
  account_id: string;
  cost_date: string;
  total_cost: number;
  resource_breakdown: Record<string, { count: number; cost: number }>;
  created_at: string;
}

export interface Recommendation {
  id: string;
  resource_id: string;
  recommendation_type: string;
  current_plan?: string;
  suggested_plan?: string;
  title?: string;
  reasoning: string;
  note?: string;
  description?: string;
  estimated_savings?: number;
  estimated_cost_increase?: number;
  potential_savings: number;
  confidence_score: number;
  metrics_summary?: any;
  status: string;
  created_at: string;
  dismissed_at?: string;
}

export interface Budget {
  id: string;
  account_id?: string;
  name: string;
  monthly_limit: number;
  alert_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SavingsProfile = 'relaxed' | 'balanced' | 'aggressive';

export interface AIConfig {
  id: string;
  api_endpoint: string;
  api_key: string;
  model_name: string;
  savings_profile: SavingsProfile;
  created_at: string;
  updated_at: string;
}

export interface SavingsProfileThresholds {
  downsize_cpu_avg: number;
  downsize_cpu_p95: number;
  upgrade_cpu_avg: number;
  upgrade_cpu_p95: number;
}

export const SAVINGS_PROFILE_THRESHOLDS: Record<SavingsProfile, SavingsProfileThresholds> = {
  relaxed: {
    downsize_cpu_avg: 10,
    downsize_cpu_p95: 25,
    upgrade_cpu_avg: 80,
    upgrade_cpu_p95: 92,
  },
  balanced: {
    downsize_cpu_avg: 20,
    downsize_cpu_p95: 40,
    upgrade_cpu_avg: 70,
    upgrade_cpu_p95: 85,
  },
  aggressive: {
    downsize_cpu_avg: 35,
    downsize_cpu_p95: 55,
    upgrade_cpu_avg: 65,
    upgrade_cpu_p95: 80,
  },
};

export interface ResourceSnapshot {
  id: string;
  resource_id: string;
  account_id: string;
  resource_type: string;
  label: string;
  region?: string;
  plan_type?: string;
  monthly_cost: number;
  status?: string;
  specs: any;
  diff: Record<string, { from: any; to: any }> | null;
  synced_at: string;
  created_at: string;
}

export type ComplianceSeverity = 'critical' | 'warning' | 'info';
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'not_applicable';

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  resource_types: string[];
  condition_type: string;
  condition_config: Record<string, any>;
  severity: ComplianceSeverity;
  is_active: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplianceResult {
  id: string;
  rule_id: string;
  resource_id: string;
  account_id: string;
  status: ComplianceStatus;
  detail: string | null;
  evaluated_at: string;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_note: string | null;
  rule?: ComplianceRule;
  resource?: Resource;
}

export interface ComplianceScoreHistory {
  id: string;
  account_id: string;
  evaluated_at: string;
  total_results: number;
  compliant_count: number;
  non_compliant_count: number;
  not_applicable_count: number;
  acknowledged_count: number;
  compliance_score: number | null;
  total_rules_evaluated: number;
  rule_breakdown: Array<{
    rule_id: string;
    rule_name: string;
    severity: string;
    compliant: number;
    non_compliant: number;
    not_applicable: number;
  }>;
  created_at: string;
}

export interface ResourceRelationship {
  id: string;
  account_id: string;
  source_id: string;
  target_id: string;
  relationship_type: string;
  synced_at: string;
  created_at: string;
  source?: Resource;
  target?: Resource;
}

export interface LinodeEvent {
  id: string;
  account_id: string;
  event_id: number;
  action: string;
  entity_id: string | null;
  entity_type: string | null;
  entity_label: string | null;
  entity_url: string | null;
  secondary_entity_id: string | null;
  secondary_entity_type: string | null;
  secondary_entity_label: string | null;
  message: string | null;
  status: string | null;
  username: string | null;
  duration: number | null;
  percent_complete: number | null;
  seen: boolean;
  event_created: string | null;
  created_at: string;
}

export const SAVINGS_PROFILE_LABELS: Record<SavingsProfile, { label: string; description: string }> = {
  relaxed: {
    label: 'Relaxed',
    description: 'Only suggest changes when utilization is very clearly mismatched. Minimizes disruption.',
  },
  balanced: {
    label: 'Balanced',
    description: 'Moderate thresholds — the default. Good mix of savings and stability.',
  },
  aggressive: {
    label: 'Aggressive',
    description: 'Maximize savings by recommending downsizes at higher utilization levels.',
  },
};
