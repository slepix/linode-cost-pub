import { useState } from 'react';
import { X, Plus, GitMerge, Info, Settings } from 'lucide-react';
import type { ComplianceRule } from '../../types';

export type CompositeOperator = 'AND' | 'OR' | 'NOT' | 'IF_THEN';

export interface CompositeConfig {
  operator: CompositeOperator;
  rule_ids: string[];
  if_rule_id?: string;
  then_rule_id?: string;
}

const CONFIGURABLE_TYPES = new Set([
  'firewall_rules_check', 'bucket_acl_check', 'bucket_cors_check', 'approved_regions',
  'db_allowlist_check', 'db_public_access', 'has_tags', 'min_node_count',
  'linode_lock_configured', 'nodebalancer_protocol_check', 'nodebalancer_port_allowlist',
  'login_allowed_ips', 'linode_backup_recency', 'linode_plan_tier_by_tag', 'firewall_rfc1918_lateral',
]);

interface CompositeRuleBuilderProps {
  availableRules: ComplianceRule[];
  value: CompositeConfig;
  onChange: (cfg: CompositeConfig) => void;
  onConfigureRule?: (rule: ComplianceRule) => void;
}

const OPERATOR_OPTIONS: { value: CompositeOperator; label: string; description: string; minRules: number; maxRules?: number }[] = [
  {
    value: 'AND',
    label: 'AND — all must pass',
    description: 'A resource is compliant only if every selected rule passes. Use this to enforce multiple requirements simultaneously.',
    minRules: 2,
  },
  {
    value: 'OR',
    label: 'OR — at least one must pass',
    description: 'A resource is compliant if any of the selected rules pass. Use this when multiple alternative configurations are acceptable.',
    minRules: 2,
  },
  {
    value: 'NOT',
    label: 'NOT — invert a rule',
    description: 'Inverts the result of a single rule — compliant becomes non-compliant and vice versa.',
    minRules: 1,
    maxRules: 1,
  },
  {
    value: 'IF_THEN',
    label: 'IF … THEN — conditional',
    description: 'If the IF rule is non-compliant, the THEN rule must be compliant. Resources where the IF rule passes are marked not applicable.',
    minRules: 0,
  },
];

export function CompositeRuleBuilder({ availableRules, value, onChange, onConfigureRule }: CompositeRuleBuilderProps) {
  const [search, setSearch] = useState('');

  const opDef = OPERATOR_OPTIONS.find(o => o.value === value.operator)!;
  const isIfThen = value.operator === 'IF_THEN';
  const isNot = value.operator === 'NOT';

  const filteredRules = availableRules.filter(r =>
    !value.rule_ids.includes(r.id) &&
    r.id !== value.if_rule_id &&
    r.id !== value.then_rule_id &&
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  function setOperator(op: CompositeOperator) {
    onChange({ operator: op, rule_ids: [], if_rule_id: undefined, then_rule_id: undefined });
  }

  function addRule(ruleId: string) {
    if (isNot) {
      onChange({ ...value, rule_ids: [ruleId] });
      return;
    }
    if (!value.rule_ids.includes(ruleId)) {
      onChange({ ...value, rule_ids: [...value.rule_ids, ruleId] });
    }
  }

  function removeRule(ruleId: string) {
    onChange({ ...value, rule_ids: value.rule_ids.filter(id => id !== ruleId) });
  }

  function setIfRule(id: string) {
    onChange({ ...value, if_rule_id: id || undefined });
  }

  function setThenRule(id: string) {
    onChange({ ...value, then_rule_id: id || undefined });
  }

  const getRuleName = (id: string) => availableRules.find(r => r.id === id)?.name ?? id;
  const getSeverityColor = (sev: string) => ({
    critical: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
  }[sev] ?? 'text-gray-500');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <GitMerge size={13} /> Logical Operator
        </p>
        <div className="grid grid-cols-2 gap-2">
          {OPERATOR_OPTIONS.map(op => (
            <button
              key={op.value}
              type="button"
              onClick={() => setOperator(op.value)}
              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-all ${
                value.operator === op.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="text-xs font-semibold font-mono">{op.value}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">{op.label.split(' — ')[1]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2">
          <Info size={11} className="flex-shrink-0 mt-0.5" />
          <span>{opDef.description}</span>
        </div>
      </div>

      {isIfThen ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">IF this rule fails…</p>
            <select
              value={value.if_rule_id ?? ''}
              onChange={e => setIfRule(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">— select a rule —</option>
              {availableRules.filter(r => r.id !== value.then_rule_id).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {value.if_rule_id && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic truncate">{getRuleName(value.if_rule_id)}</p>
            )}
          </div>

          <div className="flex justify-center">
            <span className="text-[10px] font-mono font-bold text-gray-400 dark:text-gray-500 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
              THEN
            </span>
          </div>

          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">…this rule must pass</p>
            <select
              value={value.then_rule_id ?? ''}
              onChange={e => setThenRule(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— select a rule —</option>
              {availableRules.filter(r => r.id !== value.if_rule_id).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {value.then_rule_id && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic truncate">{getRuleName(value.then_rule_id)}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {value.rule_ids.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {isNot ? 'Rule to invert' : `Selected rules (${value.rule_ids.length})`}
              </p>
              {value.rule_ids.map((id, idx) => {
                const rule = availableRules.find(r => r.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    {!isNot && (
                      <span className="text-[10px] font-mono font-bold text-gray-400 dark:text-gray-500 w-4 flex-shrink-0 text-center">
                        {idx > 0 ? value.operator : '#1'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{rule?.name ?? id}</p>
                      {rule && (
                        <p className={`text-[10px] font-medium ${getSeverityColor(rule.severity)}`}>{rule.severity}</p>
                      )}
                    </div>
                    {rule && onConfigureRule && CONFIGURABLE_TYPES.has(rule.condition_type) && (
                      <button
                        type="button"
                        onClick={() => onConfigureRule(rule)}
                        title="Configure rule settings"
                        className="p-1 text-gray-300 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                      >
                        <Settings size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRule(id)}
                      className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {(!isNot || value.rule_ids.length === 0) && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {isNot ? 'Select rule to invert' : 'Add rules'}
              </p>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search rules…"
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="max-h-44 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
                {filteredRules.length === 0 ? (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-3">No matching rules</p>
                ) : (
                  filteredRules.map(rule => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => addRule(rule.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left group"
                    >
                      <Plus size={11} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{rule.name}</p>
                        <p className={`text-[10px] ${getSeverityColor(rule.severity)}`}>{rule.severity} · {rule.condition_type.replace(/_/g, ' ')}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function validateCompositeConfig(cfg: CompositeConfig): string | null {
  if (cfg.operator === 'IF_THEN') {
    if (!cfg.if_rule_id) return 'Select the IF rule.';
    if (!cfg.then_rule_id) return 'Select the THEN rule.';
    return null;
  }
  if (cfg.operator === 'NOT') {
    if (cfg.rule_ids.length !== 1) return 'Select exactly one rule to invert.';
    return null;
  }
  if (cfg.rule_ids.length < 2) return 'Select at least 2 rules to combine.';
  return null;
}
