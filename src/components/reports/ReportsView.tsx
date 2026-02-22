import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, ShieldCheck, Server, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Download,
  Minus, ChevronRight, Activity, History,
} from 'lucide-react';
import {
  getReportComplianceScoreHistory,
  getReportComplianceResultsLatest,
  getResources,
  getAccounts,
} from '../../lib/api';
import type { ReportTab, ScoreHistoryEntry, ComplianceResultRow } from './types';
import { LineChart } from './LineChart';
import { HistoricalTrendsTab } from './HistoricalTrendsTab';
import { ExportReportModal } from './ExportReportModal';
import type { Resource } from '../../types';

interface ReportsViewProps {
  accountId: string | null;
}

const TABS: { key: ReportTab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'overview', label: 'Executive Overview', icon: BarChart3 },
  { key: 'compliance', label: 'Compliance Trends', icon: ShieldCheck },
  { key: 'historical', label: 'Historical Trends', icon: History },
  { key: 'inventory', label: 'Inventory', icon: Server },
];

const RANGE_OPTIONS = [
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
];

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  linode: 'Virtual Machines',
  volume: 'Block Storage',
  object_storage: 'Object Storage',
  lke_cluster: 'Kubernetes',
  database: 'Databases',
  nodebalancer: 'Load Balancers',
  firewall: 'Firewalls',
  vpc: 'VPC',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Pill({ status }: { status: string }) {
  if (status === 'compliant') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
      <CheckCircle size={10} /> Pass
    </span>
  );
  if (status === 'non_compliant') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      <XCircle size={10} /> Fail
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      <Minus size={10} /> N/A
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'critical') return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 uppercase tracking-wide">Critical</span>
  );
  if (severity === 'warning') return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 uppercase tracking-wide">Warning</span>
  );
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 uppercase tracking-wide">Info</span>
  );
}

function StatCard({
  label, value, subtext, trend, icon: Icon, accent,
}: {
  label: string;
  value: string;
  subtext?: string;
  trend?: { dir: 'up' | 'down' | 'flat'; label: string; positive?: boolean };
  icon: typeof BarChart3;
  accent: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</span>
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon size={15} className="text-white" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-50 leading-tight">{value}</p>
        {subtext && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtext}</p>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${
          trend.dir === 'flat'
            ? 'text-gray-400 dark:text-gray-500'
            : trend.positive
              ? (trend.dir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')
              : (trend.dir === 'down' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')
        }`}>
          {trend.dir === 'up' ? <TrendingUp size={12} /> : trend.dir === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
          {trend.label}
        </div>
      )}
    </div>
  );
}

export function ReportsView({ accountId }: ReportsViewProps) {
  const [tab, setTab] = useState<ReportTab>('overview');
  const [rangeDays, setRangeDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [accountName, setAccountName] = useState<string>('');

  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryEntry[]>([]);
  const [complianceResults, setComplianceResults] = useState<ComplianceResultRow[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [scores, results, res, accounts] = await Promise.all([
        getReportComplianceScoreHistory(accountId, rangeDays),
        getReportComplianceResultsLatest(accountId),
        getResources(accountId),
        getAccounts(),
      ]);
      setScoreHistory(scores as ScoreHistoryEntry[]);
      setComplianceResults(results as ComplianceResultRow[]);
      setResources(res);
      const acct = accounts.find((a: any) => a.id === accountId);
      if (acct) setAccountName(acct.name);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [accountId, rangeDays]);

  useEffect(() => { load(); }, [load]);

  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <BarChart3 size={40} className="text-gray-300 dark:text-gray-700 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">Select an account to view reports.</p>
      </div>
    );
  }

  const latestScore = scoreHistory.length ? scoreHistory[scoreHistory.length - 1] : null;
  const prevScore = scoreHistory.length > 1 ? scoreHistory[scoreHistory.length - 2] : null;
  const scoreDelta = latestScore && prevScore && latestScore.compliance_score != null && prevScore.compliance_score != null
    ? latestScore.compliance_score - prevScore.compliance_score
    : null;

  const totalResources = resources.length;

  const nonCompliant = complianceResults.filter(r => r.status === 'non_compliant' && !r.acknowledged);
  const criticalCount = nonCompliant.filter(r => r.compliance_rules?.severity === 'critical').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Reports</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Security posture, compliance trends, and inventory insights
            {lastRefreshed && (
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                · Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-0.5">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => setRangeDays(opt.days)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  rangeDays === opt.days
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Download size={12} />
            Export Report
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-8 justify-center">
          <Activity size={16} className="animate-pulse" />
          Loading report data...
        </div>
      )}

      {!loading && tab === 'overview' && (
        <OverviewTab
          scoreHistory={scoreHistory}
          complianceResults={complianceResults}
          resources={resources}
          latestScore={latestScore}
          scoreDelta={scoreDelta}
          totalResources={totalResources}
          criticalCount={criticalCount}
        />
      )}

      {!loading && tab === 'compliance' && (
        <ComplianceTrendsTab
          scoreHistory={scoreHistory}
          complianceResults={complianceResults}
        />
      )}

      {!loading && tab === 'historical' && (
        <HistoricalTrendsTab
          complianceResults={complianceResults}
          resources={resources}
          scoreHistory={scoreHistory}
        />
      )}

      {!loading && tab === 'inventory' && (
        <InventoryTab resources={resources} />
      )}

      {showExportModal && accountId && (
        <ExportReportModal
          accountId={accountId}
          accountName={accountName || 'Account'}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

function OverviewTab({
  scoreHistory, complianceResults, resources,
  latestScore, scoreDelta,
  totalResources, criticalCount,
}: {
  scoreHistory: ScoreHistoryEntry[];
  complianceResults: ComplianceResultRow[];
  resources: Resource[];
  latestScore: ScoreHistoryEntry | null;
  scoreDelta: number | null;
  totalResources: number;
  criticalCount: number;
}) {
  const scoreData = scoreHistory.map(s => ({ x: s.evaluated_at, y: s.compliance_score ?? 0 }));

  const nonCompliant = complianceResults.filter(r => r.status === 'non_compliant' && !r.acknowledged);
  const ruleViolationMap = new Map<string, { name: string; severity: string; count: number }>();
  for (const r of nonCompliant) {
    const key = r.rule_id;
    const existing = ruleViolationMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      ruleViolationMap.set(key, {
        name: r.compliance_rules?.name ?? 'Unknown Rule',
        severity: r.compliance_rules?.severity ?? 'info',
        count: 1,
      });
    }
  }
  const topViolations = Array.from(ruleViolationMap.values())
    .sort((a, b) => {
      const sOrder = { critical: 0, warning: 1, info: 2 };
      return (sOrder[a.severity as keyof typeof sOrder] ?? 3) - (sOrder[b.severity as keyof typeof sOrder] ?? 3) || b.count - a.count;
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Compliance Score"
          value={latestScore?.compliance_score != null ? `${latestScore.compliance_score.toFixed(1)}%` : 'N/A'}
          subtext={latestScore ? `${latestScore.compliant_count} passing / ${latestScore.total_results} total` : 'No evaluations yet'}
          trend={scoreDelta != null ? {
            dir: scoreDelta > 0.5 ? 'up' : scoreDelta < -0.5 ? 'down' : 'flat',
            label: scoreDelta > 0 ? `+${scoreDelta.toFixed(1)}pp vs prior` : scoreDelta < 0 ? `${scoreDelta.toFixed(1)}pp vs prior` : 'No change',
            positive: true,
          } : undefined}
          icon={ShieldCheck}
          accent="bg-emerald-500"
        />
        <StatCard
          label="Open Violations"
          value={nonCompliant.length.toString()}
          subtext={criticalCount > 0 ? `${criticalCount} critical` : 'No critical issues'}
          trend={criticalCount > 0 ? { dir: 'up', label: `${criticalCount} critical unresolved`, positive: false } : { dir: 'flat', label: 'No critical issues', positive: true }}
          icon={AlertTriangle}
          accent={criticalCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}
        />
        <StatCard
          label="Total Resources"
          value={totalResources.toString()}
          subtext={`${[...new Set(resources.map(r => r.resource_type))].length} resource types`}
          icon={Server}
          accent="bg-slate-500"
        />
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Compliance Score Trend</h3>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">% passing</span>
        </div>
        {scoreData.length > 1 ? (
          <LineChart
            series={[{ label: 'Score', data: scoreData, color: '#10b981' }]}
            height={160}
            formatY={v => `${v.toFixed(0)}%`}
          />
        ) : (
          <EmptyChart message="Run a compliance evaluation to see trends" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Top Compliance Violations</h3>
          {topViolations.length === 0 ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={16} />
              No open violations
            </div>
          ) : (
            <div className="space-y-2">
              {topViolations.map((v, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ backgroundColor: SEVERITY_COLOR[v.severity] ?? '#94a3b8' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{v.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{v.count} resource{v.count !== 1 ? 's' : ''} affected</p>
                  </div>
                  <SeverityBadge severity={v.severity} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Resource Distribution</h3>
          <ResourceDistribution resources={resources} />
        </div>
      </div>
    </div>
  );
}

function ComplianceTrendsTab({
  scoreHistory, complianceResults,
}: {
  scoreHistory: ScoreHistoryEntry[];
  complianceResults: ComplianceResultRow[];
}) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const scoreData = scoreHistory.map(s => ({ x: s.evaluated_at, y: s.compliance_score ?? 0 }));
  const compliantData = scoreHistory.map(s => ({ x: s.evaluated_at, y: s.compliant_count }));
  const nonCompliantData = scoreHistory.map(s => ({ x: s.evaluated_at, y: s.non_compliant_count }));

  const ruleMap = new Map<string, {
    name: string; severity: string;
    pass: number; fail: number; na: number; ack: number;
    results: ComplianceResultRow[];
  }>();
  for (const r of complianceResults) {
    const key = r.rule_id;
    if (!ruleMap.has(key)) {
      ruleMap.set(key, {
        name: r.compliance_rules?.name ?? 'Unknown',
        severity: r.compliance_rules?.severity ?? 'info',
        pass: 0, fail: 0, na: 0, ack: 0,
        results: [],
      });
    }
    const entry = ruleMap.get(key)!;
    if (r.status === 'compliant') entry.pass++;
    else if (r.status === 'non_compliant' && r.acknowledged) entry.ack++;
    else if (r.status === 'non_compliant') entry.fail++;
    else entry.na++;
    entry.results.push(r);
  }

  const ruleRows = Array.from(ruleMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => {
      const s = { critical: 0, warning: 1, info: 2 };
      return (s[a.severity as keyof typeof s] ?? 3) - (s[b.severity as keyof typeof s] ?? 3) || b.fail - a.fail;
    });

  const lastEntry = scoreHistory[scoreHistory.length - 1];
  const breakdown = lastEntry?.rule_breakdown ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Score Over Time</h3>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> Score %</span>
            </div>
          </div>
          {scoreData.length > 1 ? (
            <LineChart
              series={[{ label: 'Score', data: scoreData, color: '#10b981' }]}
              height={180}
              formatY={v => `${v.toFixed(0)}%`}
            />
          ) : <EmptyChart message="No score history yet" />}
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pass vs Fail Counts</h3>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> Pass</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" /> Fail</span>
            </div>
          </div>
          {compliantData.length > 1 ? (
            <LineChart
              series={[
                { label: 'Compliant', data: compliantData, color: '#10b981' },
                { label: 'Non-Compliant', data: nonCompliantData, color: '#ef4444', dashed: true },
              ]}
              height={180}
            />
          ) : <EmptyChart message="No history yet" />}
        </div>
      </div>

      {breakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Latest Evaluation — Rule Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {breakdown.map((b, i) => {
              const total = b.compliant + b.non_compliant + b.not_applicable;
              const pct = total > 0 ? Math.round((b.compliant / (total - b.not_applicable || 1)) * 100) : null;
              return (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <SeverityBadge severity={b.severity} />
                    <span className={`text-xs font-bold ${pct === 100 ? 'text-emerald-600 dark:text-emerald-400' : pct != null && pct < 70 ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {pct != null ? `${pct}%` : 'N/A'}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate" title={b.rule_name}>{b.rule_name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{b.compliant}P / {b.non_compliant}F / {b.not_applicable}N/A</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">All Rules — Current Status</h3>
        {ruleRows.length === 0 ? (
          <EmptyChart message="No compliance results found. Run an evaluation first." />
        ) : (
          <div className="space-y-1">
            {ruleRows.map(row => {
              const total = row.pass + row.fail + row.na + row.ack;
              const scoreable = row.pass + row.fail + row.ack;
              const pct = scoreable > 0 ? (row.pass / scoreable) * 100 : null;
              const isExpanded = expandedRule === row.id;

                const rowFullyCompliant = pct === 100;
                const rowHasViolations = row.fail > 0;

              return (
                <div key={row.id} className={`border rounded-lg overflow-hidden transition-colors ${
                  rowFullyCompliant
                    ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10'
                    : rowHasViolations
                      ? 'border-red-200 dark:border-red-800/50 bg-red-50/40 dark:bg-red-900/10'
                      : 'border-gray-100 dark:border-gray-800'
                }`}>
                  <button
                    onClick={() => setExpandedRule(isExpanded ? null : row.id)}
                    className={`w-full flex items-center gap-3 p-3 transition-colors text-left ${
                      rowFullyCompliant
                        ? 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        : rowHasViolations
                          ? 'hover:bg-red-50 dark:hover:bg-red-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: SEVERITY_COLOR[row.severity] ?? '#94a3b8' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{row.name}</span>
                        <SeverityBadge severity={row.severity} />
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 max-w-[120px]">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${pct ?? 0}%`,
                              backgroundColor: pct === 100 ? '#10b981' : pct != null && pct < 70 ? '#ef4444' : '#f59e0b',
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          {row.pass}P · {row.fail}F · {row.ack}Ack · {row.na}N/A · {total} total
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
                      {row.results.filter(r => r.status !== 'not_applicable').map(r => (
                        <div key={r.id} className={`flex items-start gap-3 px-4 py-2.5 transition-colors ${
                          r.status === 'compliant'
                            ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                            : r.status === 'non_compliant' && !r.acknowledged
                              ? 'bg-red-50/40 dark:bg-red-900/10'
                              : ''
                        }`}>
                          <Pill status={r.status} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                              {r.resources?.label ?? 'Account-level'}
                              {r.resources?.region && <span className="text-gray-400 dark:text-gray-500 ml-1">· {r.resources.region}</span>}
                            </p>
                            {r.detail && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{r.detail}</p>}
                          </div>
                          {r.acknowledged && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">Ack'd</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


function InventoryTab({ resources }: { resources: Resource[] }) {
  const typeMap = resources.reduce((acc, r) => {
    const t = r.resource_type;
    if (!acc[t]) acc[t] = { count: 0, regions: new Set<string>(), statuses: new Map<string, number>() };
    acc[t].count++;
    if (r.region) acc[t].regions.add(r.region);
    const s = r.status ?? 'unknown';
    acc[t].statuses.set(s, (acc[t].statuses.get(s) ?? 0) + 1);
    return acc;
  }, {} as Record<string, { count: number; regions: Set<string>; statuses: Map<string, number> }>);

  const regionMap = resources.reduce((acc, r) => {
    if (!r.region) return acc;
    if (!acc[r.region]) acc[r.region] = { count: 0, types: new Set<string>() };
    acc[r.region].count++;
    acc[r.region].types.add(r.resource_type);
    return acc;
  }, {} as Record<string, { count: number; types: Set<string> }>);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Total Resources</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{resources.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Resource Types</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{Object.keys(typeMap).length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Regions</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{Object.keys(regionMap).length}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Resources by Type</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide text-[10px]">Type</th>
                <th className="text-right py-2 px-4 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide text-[10px]">Count</th>
                <th className="text-right py-2 px-4 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide text-[10px]">Regions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {Object.entries(typeMap).sort((a, b) => b[1].count - a[1].count).map(([type, info]) => (
                <tr key={type} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-gray-800 dark:text-gray-200">
                    {RESOURCE_TYPE_LABELS[type] ?? type}
                  </td>
                  <td className="py-2.5 px-4 text-right text-gray-600 dark:text-gray-400 tabular-nums">{info.count}</td>
                  <td className="py-2.5 px-4 text-right text-gray-500 dark:text-gray-500 tabular-nums">{info.regions.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Regional Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(regionMap).sort((a, b) => b[1].count - a[1].count).map(([region, info]) => (
            <div key={region} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate">{region}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-50 mt-0.5">{info.count}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{info.types.size} type{info.types.size !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResourceDistribution({ resources }: { resources: Resource[] }) {
  const typeMap = resources.reduce((acc, r) => {
    acc[r.resource_type] = (acc[r.resource_type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const entries = Object.entries(typeMap).sort((a, b) => b[1] - a[1]);
  const total = resources.length;

  if (total === 0) return <EmptyChart message="No resources synced yet" />;

  return (
    <div className="space-y-2">
      {entries.map(([type, count], i) => {
        const pct = (count / total) * 100;
        const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        return (
          <div key={type} className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{RESOURCE_TYPE_LABELS[type] ?? type}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-5 text-right">{count}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
      {message}
    </div>
  );
}

function exportReport(
  scores: ScoreHistoryEntry[],
  results: ComplianceResultRow[],
  resources: Resource[],
) {
  const lines: string[] = [];

  lines.push('=== COMPLIANCE SCORE HISTORY ===');
  lines.push('Date,Score,Compliant,Non-Compliant,N/A,Acknowledged,Total');
  for (const s of scores) {
    lines.push([
      fmtDate(s.evaluated_at),
      s.compliance_score?.toFixed(2) ?? '',
      s.compliant_count,
      s.non_compliant_count,
      s.not_applicable_count,
      s.acknowledged_count,
      s.total_results,
    ].join(','));
  }

  lines.push('');
  lines.push('=== COMPLIANCE RESULTS ===');
  lines.push('Rule,Severity,Resource,Region,Status,Acknowledged,Detail,Evaluated At');
  for (const r of results) {
    const row = [
      `"${r.compliance_rules?.name ?? ''}"`,
      r.compliance_rules?.severity ?? '',
      `"${r.resources?.label ?? 'Account'}"`,
      r.resources?.region ?? '',
      r.status,
      r.acknowledged ? 'Yes' : 'No',
      `"${(r.detail ?? '').replace(/"/g, "'")}"`,
      fmtDate(r.evaluated_at),
    ].join(',');
    lines.push(row);
  }

  lines.push('');
  lines.push('=== INVENTORY ===');
  lines.push('Label,Type,Region,Status,Monthly Cost');
  for (const r of resources) {
    lines.push([
      `"${r.label}"`,
      r.resource_type,
      r.region ?? '',
      r.status ?? '',
      r.monthly_cost.toFixed(2),
    ].join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linode-report-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
