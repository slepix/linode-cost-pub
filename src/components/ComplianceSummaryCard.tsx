import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldOff, AlertTriangle, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { getComplianceSummary, getComplianceResults } from '../lib/api';
import type { NavSection } from './Sidebar';

interface ComplianceSummaryCardProps {
  accountId: string;
  refreshTrigger: number;
  onSectionChange: (section: NavSection) => void;
}

interface ComplianceSummary {
  total: number;
  compliant: number;
  non_compliant: number;
  not_applicable: number;
}

interface TopViolation {
  ruleName: string;
  severity: string;
  count: number;
}

export function ComplianceSummaryCard({ accountId, refreshTrigger, onSectionChange }: ComplianceSummaryCardProps) {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [topViolations, setTopViolations] = useState<TopViolation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [sum, results] = await Promise.all([
          getComplianceSummary(accountId),
          getComplianceResults(accountId),
        ]);
        if (cancelled) return;
        setSummary(sum);

        const nonCompliant = results.filter((r: any) => r.status === 'non_compliant' && !r.acknowledged);
        const byRule = new Map<string, { ruleName: string; severity: string; count: number }>();
        for (const r of nonCompliant) {
          const rule = r.compliance_rules;
          if (!rule) continue;
          const existing = byRule.get(rule.id) || { ruleName: rule.name, severity: rule.severity, count: 0 };
          existing.count += 1;
          byRule.set(rule.id, existing);
        }

        const sorted = Array.from(byRule.values()).sort((a, b) => {
          const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
          const sA = severityOrder[a.severity] ?? 3;
          const sB = severityOrder[b.severity] ?? 3;
          if (sA !== sB) return sA - sB;
          return b.count - a.count;
        });

        setTopViolations(sorted.slice(0, 4));
      } catch {
        // silently handle — no compliance data yet
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [accountId, refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[0, 1, 2].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg" />)}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded" />)}
        </div>
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} className="text-gray-400 dark:text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Compliance</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <ShieldOff size={32} className="text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No compliance data yet.</p>
          <button
            onClick={() => onSectionChange('compliance_results')}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Run evaluation in Config & Compliance
          </button>
        </div>
      </div>
    );
  }

  const passRate = summary.total > 0
    ? Math.round((summary.compliant / (summary.total - summary.not_applicable)) * 100)
    : 0;

  const hasViolations = summary.non_compliant > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className={hasViolations ? 'text-red-500' : 'text-emerald-500'} />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Compliance</h2>
        </div>
        <button
          onClick={() => onSectionChange('compliance_results')}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
        >
          View all
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 mb-1" />
          <span className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{summary.compliant}</span>
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">Compliant</span>
        </div>
        <div className={`flex flex-col items-center justify-center p-3 rounded-lg border ${
          hasViolations
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700'
        }`}>
          <XCircle size={18} className={`mb-1 ${hasViolations ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`} />
          <span className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{summary.non_compliant}</span>
          <span className={`text-[10px] font-medium mt-0.5 ${hasViolations ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>Violations</span>
        </div>
        <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
          <ShieldOff size={18} className="text-gray-400 dark:text-gray-500 mb-1" />
          <span className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{summary.not_applicable}</span>
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">N/A</span>
        </div>
      </div>

      {/* Pass rate bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Pass rate</span>
          <span className={`text-sm font-bold ${
            passRate >= 90 ? 'text-emerald-600 dark:text-emerald-400'
            : passRate >= 70 ? 'text-amber-600 dark:text-amber-400'
            : 'text-red-600 dark:text-red-400'
          }`}>{isNaN(passRate) ? '—' : `${passRate}%`}</span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              passRate >= 90 ? 'bg-emerald-500 dark:bg-emerald-400'
              : passRate >= 70 ? 'bg-amber-500 dark:bg-amber-400'
              : 'bg-red-500 dark:bg-red-400'
            }`}
            style={{ width: `${isNaN(passRate) ? 0 : passRate}%` }}
          />
        </div>
      </div>

      {/* Top violations */}
      {topViolations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top violations</p>
          <div className="space-y-2">
            {topViolations.map((v, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <AlertTriangle
                  size={13}
                  className={`flex-shrink-0 ${
                    v.severity === 'critical' ? 'text-red-500 dark:text-red-400'
                    : v.severity === 'warning' ? 'text-amber-500 dark:text-amber-400'
                    : 'text-blue-500 dark:text-blue-400'
                  }`}
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{v.ruleName}</span>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  v.severity === 'critical'
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    : v.severity === 'warning'
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                }`}>
                  {v.count} {v.count === 1 ? 'resource' : 'resources'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
