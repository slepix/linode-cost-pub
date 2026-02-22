export type ReportTab = 'overview' | 'compliance' | 'inventory' | 'historical';

export interface ScoreHistoryEntry {
  id: string;
  evaluated_at: string;
  compliance_score: number | null;
  compliant_count: number;
  non_compliant_count: number;
  not_applicable_count: number;
  acknowledged_count: number;
  total_results: number;
  total_rules_evaluated: number;
  rule_breakdown: Array<{
    rule_id: string;
    rule_name: string;
    severity: string;
    compliant: number;
    non_compliant: number;
    not_applicable: number;
  }>;
}

export interface CostEntry {
  cost_date: string;
  total_cost: number;
  resource_breakdown: Record<string, { count: number; cost: number }>;
}

export interface ComplianceResultNote {
  id: string;
  note: string;
  created_at: string;
  author: { email: string; full_name: string | null } | null;
}

export interface ComplianceResultRow {
  id: string;
  rule_id: string;
  resource_id: string | null;
  status: string;
  detail: string | null;
  evaluated_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_note: string | null;
  acknowledged_by: string | null;
  acknowledger: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  compliance_rules: {
    name: string;
    severity: string;
    resource_types: string[];
    condition_type: string;
  } | null;
  resources: {
    resource_type: string;
    label: string;
    region: string | null;
  } | null;
  notes?: ComplianceResultNote[];
}
