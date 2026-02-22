import { useState, useEffect } from 'react';
import { History, ChevronDown, ChevronUp, GitCommit, Loader2, Filter, Plus, Eye } from 'lucide-react';
import { getAccountSnapshots, getAccountAllSnapshots } from '../../lib/api';

interface ChangeHistoryPanelProps {
  accountId: string;
}

const FIELD_LABELS: Record<string, string> = {
  label: 'Label',
  status: 'Status',
  region: 'Region',
  plan_type: 'Plan',
  monthly_cost: 'Monthly Cost',
  specs: 'Configuration',
};

function formatValue(field: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (field === 'monthly_cost') return `$${Number(value).toFixed(2)}`;
  if (field === 'specs') return 'Configuration changed';
  return String(value);
}

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

type ViewMode = 'changes' | 'all';

export function ChangeHistoryPanel({ accountId }: ChangeHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('changes');

  useEffect(() => {
    load();
  }, [accountId, viewMode]);

  async function load() {
    setLoading(true);
    try {
      const data = viewMode === 'all'
        ? await getAccountAllSnapshots(accountId, 500)
        : await getAccountSnapshots(accountId, 200);
      setSnapshots(data);
    } catch {}
    setLoading(false);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const resourceTypes = ['all', ...Array.from(new Set(snapshots.map(s => s.resource_type)))];
  const filtered = filterType === 'all' ? snapshots : snapshots.filter(s => s.resource_type === filterType);

  const groupedByDate: Record<string, any[]> = {};
  for (const s of filtered) {
    const date = new Date(s.synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(s);
  }

  const changesCount = snapshots.filter(s => s.diff !== null).length;
  const firstSeenCount = snapshots.filter(s => s.diff === null).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('changes')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'changes'
                  ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <GitCommit size={12} />
              Changes
              <span className="ml-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-[10px]">
                {changesCount}
              </span>
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Eye size={12} />
              All syncs
              {viewMode === 'all' && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full text-[10px]">
                  {snapshots.length}
                </span>
              )}
            </button>
          </div>
          {viewMode === 'all' && firstSeenCount > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {firstSeenCount} first seen, {changesCount} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {resourceTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All types' : t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <History size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
            {viewMode === 'changes' ? 'No changes detected' : 'No sync history yet'}
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            {viewMode === 'changes'
              ? 'Changes will appear here after you sync your account at least twice.'
              : 'Sync your account to start building history.'}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groupedByDate).map(([date, items]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{date}</span>
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="space-y-2">
              {items.map(snap => {
                const isFirstSeen = snap.diff === null;
                const isExp = expanded.has(snap.id);
                const diffKeys = snap.diff ? Object.keys(snap.diff).filter(k => k !== 'specs') : [];
                const hasSpecsChange = snap.diff?.specs;
                const allChanges = [...diffKeys, ...(hasSpecsChange ? ['specs'] : [])];
                const canExpand = !isFirstSeen && allChanges.length > 0;

                return (
                  <div key={snap.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div
                      className={`flex items-center gap-3 p-3.5 transition-colors ${canExpand ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''}`}
                      onClick={() => canExpand && toggleExpand(snap.id)}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isFirstSeen
                          ? 'bg-green-100 dark:bg-green-900/40'
                          : 'bg-blue-100 dark:bg-blue-900/40'
                      }`}>
                        {isFirstSeen
                          ? <Plus size={12} className="text-green-600 dark:text-green-400" />
                          : <GitCommit size={12} className="text-blue-600 dark:text-blue-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{snap.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded capitalize">
                            {snap.resource_type?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {isFirstSeen ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded">
                              First seen
                            </span>
                          ) : (
                            allChanges.map(k => (
                              <span key={k} className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded">
                                {FIELD_LABELS[k] || k} changed
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">{formatRelativeTime(snap.synced_at)}</span>
                        {canExpand && (isExp ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />)}
                      </div>
                    </div>

                    {isExp && snap.diff && (
                      <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 px-4 py-3 space-y-3">
                        {diffKeys.map(field => (
                          <div key={field} className="grid grid-cols-3 gap-2 text-xs">
                            <span className="font-medium text-gray-600 dark:text-gray-400">{FIELD_LABELS[field] || field}</span>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded line-through">
                                {formatValue(field, snap.diff[field].from)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded">
                                {formatValue(field, snap.diff[field].to)}
                              </span>
                            </div>
                          </div>
                        ))}
                        {hasSpecsChange && (
                          <div className="text-xs">
                            <span className="font-medium text-gray-600 dark:text-gray-400">Configuration</span>
                            <div className="mt-1.5 space-y-1">
                              {Object.keys(snap.diff.specs?.to || {}).map(k => {
                                const fromVal = snap.diff.specs?.from?.[k];
                                const toVal = snap.diff.specs?.to?.[k];
                                if (JSON.stringify(fromVal) === JSON.stringify(toVal)) return null;
                                return (
                                  <div key={k} className="grid grid-cols-3 gap-2">
                                    <span className="text-gray-500 dark:text-gray-400 capitalize">{k.replace('_', ' ')}</span>
                                    <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded truncate line-through">
                                      {JSON.stringify(fromVal) ?? '—'}
                                    </span>
                                    <span className="px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded truncate">
                                      {JSON.stringify(toVal) ?? '—'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="pt-1 text-[10px] text-gray-400 dark:text-gray-500">
                          Synced at {new Date(snap.synced_at).toLocaleString()}
                          {snap.region && ` · ${snap.region}`}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
