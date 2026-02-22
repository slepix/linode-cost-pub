import { useState, useEffect } from 'react';
import { ShieldCheck, History, GitFork, ActivitySquare, RefreshCw, AlertTriangle } from 'lucide-react';
import { CompliancePanel } from './config/CompliancePanel';
import { ChangeHistoryPanel } from './config/ChangeHistoryPanel';
import { RelationshipPanel } from './config/RelationshipPanel';
import { EventTimelinePanel } from './config/EventTimelinePanel';
import { getComplianceSummary } from '../lib/api';

interface ConfigViewProps {
  accountId: string | null;
  syncTrigger?: number;
  onNavigateToRuleManager?: () => void;
  readOnly?: boolean;
}

type ConfigTab = 'compliance' | 'history' | 'relationships' | 'events';

const tabs: { key: ConfigTab; label: string; icon: typeof ShieldCheck }[] = [
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { key: 'history', label: 'Change History', icon: History },
  { key: 'relationships', label: 'Relationships', icon: GitFork },
  { key: 'events', label: 'Event Timeline', icon: ActivitySquare },
];

export function ConfigView({ accountId, syncTrigger, onNavigateToRuleManager, readOnly = false }: ConfigViewProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>('compliance');
  const [summary, setSummary] = useState<{ total: number; compliant: number; non_compliant: number; not_applicable: number } | null>(null);

  useEffect(() => {
    if (accountId) loadSummary();
  }, [accountId, syncTrigger]);

  async function loadSummary() {
    if (!accountId) return;
    try {
      const s = await getComplianceSummary(accountId);
      setSummary(s);
    } catch {}
  }

  const complianceScore = summary && summary.total > 0
    ? Math.round(((summary.compliant) / (summary.total - (summary.not_applicable || 0))) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Config & Compliance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Track configuration changes, evaluate compliance rules, and explore resource relationships.
          </p>
        </div>
        {summary && summary.total > 0 && (
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              (complianceScore ?? 0) >= 80
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : (complianceScore ?? 0) >= 50
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}>
              <ShieldCheck size={18} className={
                (complianceScore ?? 0) >= 80 ? 'text-green-600 dark:text-green-400'
                : (complianceScore ?? 0) >= 50 ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
              } />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Compliance Score</p>
                <p className={`text-lg font-bold leading-tight ${
                  (complianceScore ?? 0) >= 80 ? 'text-green-700 dark:text-green-300'
                  : (complianceScore ?? 0) >= 50 ? 'text-amber-700 dark:text-amber-300'
                  : 'text-red-700 dark:text-red-300'
                }`}>
                  {complianceScore !== null ? `${complianceScore}%` : '—'}
                </p>
              </div>
            </div>
            {summary.non_compliant > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Violations</p>
                  <p className="text-lg font-bold leading-tight text-red-700 dark:text-red-300">{summary.non_compliant}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!accountId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <RefreshCw size={40} className="text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Select an account to view configuration data.</p>
        </div>
      )}

      {accountId && (
        <>
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex gap-1">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === key
                      ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div>
            {activeTab === 'compliance' && (
              <CompliancePanel accountId={accountId} onSummaryChange={setSummary} onNavigateToRuleManager={onNavigateToRuleManager} syncTrigger={syncTrigger} readOnly={readOnly} />
            )}
            {activeTab === 'history' && (
              <ChangeHistoryPanel accountId={accountId} />
            )}
            {activeTab === 'relationships' && (
              <RelationshipPanel accountId={accountId} />
            )}
            {activeTab === 'events' && (
              <EventTimelinePanel accountId={accountId} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
