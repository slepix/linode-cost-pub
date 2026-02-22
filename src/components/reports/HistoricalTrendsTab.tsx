import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  History, ChevronRight, Search, Filter,
  CheckCircle, XCircle, Minus, MapPin, Tag, Server, Layers,
  AlertTriangle, Play, Pause,
  ChevronLeft, SkipBack, SkipForward, TrendingUp, TrendingDown,
} from 'lucide-react';
import type { ComplianceResultRow, ScoreHistoryEntry } from './types';
import type { Resource } from '../../types';
import { LineChart } from './LineChart';
import { getResourceComplianceHistory } from '../../lib/api';

interface ResourceHistoryEntry {
  id: string;
  resource_id: string;
  evaluated_at: string;
  results: Array<{
    rule_id: string;
    rule_name: string;
    severity: string;
    status: string;
    detail: string | null;
    acknowledged: boolean;
  }>;
}

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

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

type DrillMode = 'resource' | 'type' | 'region' | 'tag' | 'rule';

interface GroupEntry {
  key: string;
  label: string;
  pass: number;
  fail: number;
  na: number;
  ack: number;
  score: number | null;
  results: ComplianceResultRow[];
  trend?: 'up' | 'down' | 'flat';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusPill({ status, ack }: { status: string; ack?: boolean }) {
  if (ack) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      <Minus size={10} /> Ack
    </span>
  );
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

function ScoreBar({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>;
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const h = size === 'sm' ? 'h-1' : 'h-1.5';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`flex-1 bg-gray-200 dark:bg-gray-700 rounded-full ${h} min-w-[60px]`}>
        <div className={`${h} rounded-full transition-all`} style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{score.toFixed(0)}%</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <History size={32} className="text-gray-300 dark:text-gray-700 mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

interface ResourceDetailProps {
  resource: Resource;
  results: ComplianceResultRow[];
  scoreHistory: ScoreHistoryEntry[];
  onBack: () => void;
}

function ResourceDetail({ resource, results, scoreHistory, onBack }: ResourceDetailProps) {
  const [resourceHistory, setResourceHistory] = useState<ResourceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    setHistoryLoading(true);
    getResourceComplianceHistory(resource.id)
      .then(data => setResourceHistory(data as ResourceHistoryEntry[]))
      .catch(() => setResourceHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [resource.id]);

  const snapshots = useMemo(() => resourceHistory.slice().sort((a, b) =>
    new Date(a.evaluated_at).getTime() - new Date(b.evaluated_at).getTime()
  ), [resourceHistory]);

  const [sliderIdx, setSliderIdx] = useState(0);

  useEffect(() => {
    setSliderIdx(snapshots.length > 0 ? snapshots.length - 1 : 0);
  }, [snapshots.length]);

  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPlay = useCallback(() => {
    if (snapshots.length <= 1) return;
    setIsPlaying(true);
    setSliderIdx(0);
    intervalRef.current = setInterval(() => {
      setSliderIdx(prev => {
        if (prev >= snapshots.length - 1) {
          clearInterval(intervalRef.current!);
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 800);
  }, [snapshots.length]);

  const stopPlay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsPlaying(false);
  }, []);

  const resourceResults = results.filter(r => r.resource_id === resource.id);
  const ruleMap = useMemo(() => {
    const m = new Map<string, { name: string; severity: string; status: string; ack: boolean; detail: string | null }>();
    for (const r of resourceResults) {
      m.set(r.rule_id, {
        name: r.compliance_rules?.name ?? 'Unknown',
        severity: r.compliance_rules?.severity ?? 'info',
        status: r.status,
        ack: r.acknowledged,
        detail: r.detail,
      });
    }
    return m;
  }, [resourceResults]);

  const ruleRows = useMemo(() =>
    Array.from(ruleMap.values()).sort((a, b) => {
      const s = { critical: 0, warning: 1, info: 2 };
      return (s[a.severity as keyof typeof s] ?? 3) - (s[b.severity as keyof typeof s] ?? 3);
    }),
    [ruleMap]
  );

  const pass = resourceResults.filter(r => r.status === 'compliant').length;
  const fail = resourceResults.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
  const total = resourceResults.filter(r => r.status !== 'not_applicable').length;
  const score = total > 0 ? Math.round((pass / total) * 100) : null;

  const tags: string[] = resource.specs?.tags ?? [];

  const currentSnapshot = snapshots[sliderIdx] ?? null;
  const isLatest = sliderIdx === snapshots.length - 1;

  const snapshotResults = currentSnapshot?.results ?? [];

  const snapshotStats = useMemo(() => {
    const applicable = snapshotResults.filter(r => r.status !== 'not_applicable' && !r.acknowledged);
    const p = applicable.filter(r => r.status === 'compliant').length;
    const f = applicable.filter(r => r.status === 'non_compliant').length;
    const na = snapshotResults.filter(r => r.status === 'not_applicable').length;
    const scoreable = p + f;
    return {
      pass: p,
      fail: f,
      na,
      total: snapshotResults.length,
      score: scoreable > 0 ? Math.round((p / scoreable) * 100) : null,
    };
  }, [snapshotResults]);

  const scoreData = useMemo(() => snapshots.map(s => {
    const applicable = s.results.filter(r => r.status !== 'not_applicable' && !r.acknowledged);
    const p = applicable.filter(r => r.status === 'compliant').length;
    const f = applicable.filter(r => r.status === 'non_compliant').length;
    const scoreable = p + f;
    return { x: s.evaluated_at, y: scoreable > 0 ? Math.round((p / scoreable) * 100) : 0 };
  }), [snapshots]);

  const mergedRules = useMemo(() => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    const allRuleNames = new Set([
      ...ruleRows.map(r => r.name),
      ...snapshotResults.map(r => r.rule_name),
    ]);
    return Array.from(allRuleNames).map(name => {
      const current = ruleRows.find(r => r.name === name);
      const hist = snapshotResults.find(r => r.rule_name === name);
      return {
        name,
        severity: current?.severity ?? hist?.severity ?? 'info',
        currentStatus: current?.status ?? null,
        currentAck: current?.ack ?? false,
        currentDetail: current?.detail ?? null,
        histStatus: hist?.status ?? null,
        histAck: hist?.acknowledged ?? false,
        histDetail: hist?.detail ?? null,
      };
    }).sort((a, b) =>
      (sevOrder[a.severity as keyof typeof sevOrder] ?? 3) - (sevOrder[b.severity as keyof typeof sevOrder] ?? 3)
    );
  }, [ruleRows, snapshotResults]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopPlay();
    setSliderIdx(Number(e.target.value));
  };

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline transition-opacity hover:opacity-80"
      >
        <ChevronLeft size={13} />
        Back to list
      </button>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-50">{resource.label}</h3>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {RESOURCE_TYPE_LABELS[resource.resource_type] ?? resource.resource_type}
              </span>
              {resource.region && (
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <MapPin size={10} /> {resource.region}
                </span>
              )}
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 rounded">
                  <Tag size={9} /> {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums" style={{ color: score == null ? '#94a3b8' : score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444' }}>
              {score != null ? `${score}%` : '—'}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{pass} pass · {fail} fail · latest</div>
          </div>
        </div>
      </div>

      {historyLoading && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            Loading compliance history...
          </div>
        </div>
      )}

      {!historyLoading && snapshots.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <History size={28} className="text-gray-300 dark:text-gray-700 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No history yet</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Run a compliance evaluation to start recording history for this resource.</p>
          </div>
        </div>
      )}

      {!historyLoading && snapshots.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Compliance Timeline</h4>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Scrub through {snapshots.length} evaluation snapshot{snapshots.length !== 1 ? 's' : ''} to see how compliance changed over time
                </p>
              </div>
              {currentSnapshot && (
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-50">
                    {new Date(currentSnapshot.evaluated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    {new Date(currentSnapshot.evaluated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    {isLatest && <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded text-[9px] font-semibold">LATEST</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {snapshots.length > 1 && (
            <div className="px-5 pt-4 pb-2">
              <LineChart
                series={[{ label: 'Score', data: scoreData, color: '#10b981' }]}
                height={100}
                formatY={v => `${v.toFixed(0)}%`}
                highlightIndex={sliderIdx}
              />
              <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-1">
                Showing compliance score for rules applicable to this resource type
              </p>
            </div>
          )}

          <div className="px-5 pb-5 pt-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { stopPlay(); setSliderIdx(0); }}
                disabled={sliderIdx === 0}
                className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Go to first"
              >
                <SkipBack size={14} />
              </button>
              <button
                onClick={() => { stopPlay(); setSliderIdx(prev => Math.max(0, prev - 1)); }}
                disabled={sliderIdx === 0}
                className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={isPlaying ? stopPlay : startPlay}
                disabled={snapshots.length <= 1}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={() => { stopPlay(); setSliderIdx(prev => Math.min(snapshots.length - 1, prev + 1)); }}
                disabled={sliderIdx === snapshots.length - 1}
                className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => { stopPlay(); setSliderIdx(snapshots.length - 1); }}
                disabled={sliderIdx === snapshots.length - 1}
                className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Go to latest"
              >
                <SkipForward size={14} />
              </button>
              <div className="flex-1 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, snapshots.length - 1)}
                  value={sliderIdx}
                  onChange={handleSliderChange}
                  className="w-full h-1.5 appearance-none rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer accent-blue-600"
                  style={{
                    background: snapshots.length > 1
                      ? `linear-gradient(to right, #2563eb ${(sliderIdx / (snapshots.length - 1)) * 100}%, rgb(229,231,235) ${(sliderIdx / (snapshots.length - 1)) * 100}%)`
                      : undefined,
                  }}
                />
                <div
                  className="absolute flex gap-px pointer-events-none"
                  style={{ left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }}
                >
                  {snapshots.map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 flex justify-center"
                    >
                      <div
                        className={`w-0.5 h-1.5 rounded-full transition-colors ${i <= sliderIdx ? 'bg-blue-400' : 'bg-gray-400 dark:bg-gray-600'}`}
                        style={{ opacity: 0.5 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap tabular-nums">
                {sliderIdx + 1} / {snapshots.length}
              </span>
            </div>

            {snapshots.length > 2 && (
              <div className="flex justify-between mt-1 px-0.5">
                <span className="text-[9px] text-gray-400 dark:text-gray-600">
                  {fmtDate(snapshots[0].evaluated_at)}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-600">
                  {fmtDate(snapshots[snapshots.length - 1].evaluated_at)}
                </span>
              </div>
            )}
          </div>

          {currentSnapshot && (
            <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4">
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Score', value: snapshotStats.score != null ? `${snapshotStats.score}%` : '—', color: snapshotStats.score == null ? 'text-gray-400' : snapshotStats.score >= 90 ? 'text-emerald-600 dark:text-emerald-400' : snapshotStats.score >= 70 ? 'text-amber-500' : 'text-red-500 dark:text-red-400' },
                  { label: 'Passing', value: snapshotStats.pass.toString(), color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Failing', value: snapshotStats.fail.toString(), color: snapshotStats.fail > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400' },
                  { label: 'Rules', value: snapshotStats.total.toString(), color: 'text-gray-700 dark:text-gray-300' },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                    <div className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              <h5 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                {isLatest ? 'Current rule results' : `Rule results at this snapshot`} ({mergedRules.length})
              </h5>
              <div className="space-y-1.5">
                {mergedRules.map((rule, i) => {
                  const histStatus = rule.histStatus;
                  const isCompliant = histStatus === 'compliant';
                  const isNonCompliant = histStatus === 'non_compliant' && !rule.histAck;
                  const isAck = histStatus === 'non_compliant' && rule.histAck;
                  const isNA = histStatus === 'not_applicable';
                  const statusChangedVsCurrent = !isLatest && rule.currentStatus != null && histStatus != null
                    && rule.currentStatus !== histStatus;

                  return (
                    <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                      histStatus === 'compliant'
                        ? 'bg-emerald-50/60 dark:bg-emerald-900/15 border-emerald-200/60 dark:border-emerald-800/40'
                        : histStatus === 'non_compliant' && !rule.histAck
                          ? 'bg-red-50/60 dark:bg-red-900/15 border-red-200/60 dark:border-red-800/40'
                          : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
                    }`}>
                      <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: SEVERITY_COLOR[rule.severity] ?? '#94a3b8' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">{rule.name}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <SeverityBadge severity={rule.severity} />
                            {statusChangedVsCurrent && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-semibold">CHANGED</span>
                            )}
                            {histStatus != null ? (
                              isAck ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                  <Minus size={10} /> Ack
                                </span>
                              ) : isNA ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-400">N/A</span>
                              ) : isCompliant ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle size={10} /> Pass
                                </span>
                              ) : isNonCompliant ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                                  <XCircle size={10} /> Fail
                                </span>
                              ) : null
                            ) : (
                              <span className="text-[10px] text-gray-300 dark:text-gray-600">—</span>
                            )}
                          </div>
                        </div>
                        {(rule.histDetail || rule.currentDetail) && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed truncate">
                            {rule.histDetail ?? rule.currentDetail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface HistoricalTrendsTabProps {
  complianceResults: ComplianceResultRow[];
  resources: Resource[];
  scoreHistory: ScoreHistoryEntry[];
}

export function HistoricalTrendsTab({ complianceResults, resources, scoreHistory }: HistoricalTrendsTabProps) {
  const [mode, setMode] = useState<DrillMode>('resource');
  const [search, setSearch] = useState('');
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const resourceMap = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const r of resources) m.set(r.id, r);
    return m;
  }, [resources]);

  const grouped = useMemo<GroupEntry[]>(() => {
    const map = new Map<string, { label: string; pass: number; fail: number; na: number; ack: number; results: ComplianceResultRow[] }>();

    for (const r of complianceResults) {
      let key = '';
      let label = '';

      if (mode === 'resource') {
        key = r.resource_id ?? 'account';
        const res = r.resource_id ? resourceMap.get(r.resource_id) : null;
        label = res?.label ?? r.resources?.label ?? (r.resource_id ? r.resource_id : 'Account-level');
      } else if (mode === 'type') {
        const res = r.resource_id ? resourceMap.get(r.resource_id) : null;
        key = res?.resource_type ?? r.resources?.resource_type ?? 'unknown';
        label = RESOURCE_TYPE_LABELS[key] ?? key;
      } else if (mode === 'region') {
        const res = r.resource_id ? resourceMap.get(r.resource_id) : null;
        key = res?.region ?? r.resources?.region ?? 'global';
        label = key;
      } else if (mode === 'tag') {
        const res = r.resource_id ? resourceMap.get(r.resource_id) : null;
        const tags: string[] = res?.specs?.tags ?? [];
        if (tags.length === 0) {
          const tagKey = '__untagged__';
          if (!map.has(tagKey)) map.set(tagKey, { label: 'Untagged', pass: 0, fail: 0, na: 0, ack: 0, results: [] });
          const e = map.get(tagKey)!;
          if (r.status === 'compliant') e.pass++;
          else if (r.status === 'non_compliant' && r.acknowledged) e.ack++;
          else if (r.status === 'non_compliant') e.fail++;
          else e.na++;
          e.results.push(r);
          continue;
        }
        for (const tag of tags) {
          if (!map.has(tag)) map.set(tag, { label: tag, pass: 0, fail: 0, na: 0, ack: 0, results: [] });
          const e = map.get(tag)!;
          if (r.status === 'compliant') e.pass++;
          else if (r.status === 'non_compliant' && r.acknowledged) e.ack++;
          else if (r.status === 'non_compliant') e.fail++;
          else e.na++;
          e.results.push(r);
        }
        continue;
      } else if (mode === 'rule') {
        key = r.rule_id;
        label = r.compliance_rules?.name ?? r.rule_id;
      }

      if (!map.has(key)) map.set(key, { label, pass: 0, fail: 0, na: 0, ack: 0, results: [] });
      const e = map.get(key)!;
      if (r.status === 'compliant') e.pass++;
      else if (r.status === 'non_compliant' && r.acknowledged) e.ack++;
      else if (r.status === 'non_compliant') e.fail++;
      else e.na++;
      e.results.push(r);
    }

    return Array.from(map.entries()).map(([key, v]) => {
      const scoreable = v.pass + v.fail + v.ack;
      const score = scoreable > 0 ? Math.round((v.pass / scoreable) * 100) : null;
      return { key, label: v.label, pass: v.pass, fail: v.fail, na: v.na, ack: v.ack, score, results: v.results };
    }).sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return a.score - b.score;
    });
  }, [complianceResults, resources, resourceMap, mode]);

  const filtered = useMemo(() =>
    search ? grouped.filter(g => g.label.toLowerCase().includes(search.toLowerCase())) : grouped,
    [grouped, search]
  );

  const scoreData = scoreHistory.map(s => ({ x: s.evaluated_at, y: s.compliance_score ?? 0 }));

  const MODES: { key: DrillMode; label: string; icon: typeof Server }[] = [
    { key: 'resource', label: 'By Resource', icon: Server },
    { key: 'type', label: 'By Type', icon: Layers },
    { key: 'region', label: 'By Region', icon: MapPin },
    { key: 'tag', label: 'By Tag', icon: Tag },
    { key: 'rule', label: 'By Rule', icon: AlertTriangle },
  ];

  if (selectedResource) {
    return (
      <ResourceDetail
        resource={selectedResource}
        results={complianceResults}
        scoreHistory={scoreHistory}
        onBack={() => setSelectedResource(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {scoreData.length > 1 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Compliance Score History</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Overall account compliance trend over time</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {scoreHistory.length > 0 && (() => {
                const latest = scoreHistory[scoreHistory.length - 1];
                const prev = scoreHistory.length > 1 ? scoreHistory[scoreHistory.length - 2] : null;
                const delta = prev && latest.compliance_score != null && prev.compliance_score != null
                  ? latest.compliance_score - prev.compliance_score : null;
                if (delta == null) return null;
                return (
                  <span className={`flex items-center gap-1 font-medium ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}pp vs prior
                  </span>
                );
              })()}
            </div>
          </div>
          <LineChart
            series={[
              { label: 'Score', data: scoreData, color: '#10b981' },
              { label: 'Compliant', data: scoreHistory.map(s => ({ x: s.evaluated_at, y: s.compliant_count })), color: '#3b82f6', dashed: true },
            ]}
            height={160}
            formatY={v => `${v.toFixed(0)}`}
          />
          <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> Score %</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block rounded border-dashed" /> Compliant count</span>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Drill-Down Analysis</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Explore compliance posture by different dimensions</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5 flex-wrap">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); setExpandedGroup(null); setSearch(''); }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    mode === m.key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  <m.icon size={11} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={`Search ${MODES.find(m2 => m2.key === mode)?.label.toLowerCase() ?? ''}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
            <Filter size={11} />
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState message="No compliance data available. Run a compliance evaluation first." />
        ) : (
          <div className="space-y-1">
            {filtered.map(group => {
              const isExpanded = expandedGroup === group.key;
              const total = group.pass + group.fail + group.na + group.ack;
              const resourceEntry = mode === 'resource' ? resourceMap.get(group.key) : null;
              const tags: string[] = resourceEntry?.specs?.tags ?? [];

              const uniqueRules = new Map<string, { name: string; severity: string; pass: number; fail: number; ack: number }>();
              for (const r of group.results) {
                const rk = r.rule_id;
                if (!uniqueRules.has(rk)) {
                  uniqueRules.set(rk, {
                    name: r.compliance_rules?.name ?? 'Unknown',
                    severity: r.compliance_rules?.severity ?? 'info',
                    pass: 0, fail: 0, ack: 0,
                  });
                }
                const re = uniqueRules.get(rk)!;
                if (r.status === 'compliant') re.pass++;
                else if (r.status === 'non_compliant' && r.acknowledged) re.ack++;
                else if (r.status === 'non_compliant') re.fail++;
              }
              const ruleList = Array.from(uniqueRules.values()).sort((a, b) => {
                const s = { critical: 0, warning: 1, info: 2 };
                return (s[a.severity as keyof typeof s] ?? 3) - (s[b.severity as keyof typeof s] ?? 3) || b.fail - a.fail;
              });

              const uniqueResources = mode !== 'resource' ? new Map<string, { label: string; type: string; region: string | null; score: number | null }>() : null;
              if (uniqueResources) {
                for (const r of group.results) {
                  if (!r.resource_id) continue;
                  if (!uniqueResources.has(r.resource_id)) {
                    const res = resourceMap.get(r.resource_id);
                    uniqueResources.set(r.resource_id, {
                      label: res?.label ?? r.resources?.label ?? r.resource_id,
                      type: res?.resource_type ?? r.resources?.resource_type ?? 'unknown',
                      region: res?.region ?? r.resources?.region ?? null,
                      score: null,
                    });
                  }
                }
                for (const [rid, entry] of uniqueResources) {
                  const rResults = group.results.filter(r => r.resource_id === rid);
                  const rPass = rResults.filter(r => r.status === 'compliant').length;
                  const rFail = rResults.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
                  const rAck = rResults.filter(r => r.status === 'non_compliant' && r.acknowledged).length;
                  const rScoreable = rPass + rFail + rAck;
                  entry.score = rScoreable > 0 ? Math.round((rPass / rScoreable) * 100) : null;
                }
              }

              const groupFullyCompliant = group.fail === 0 && group.pass > 0 && group.ack === 0;
              const groupHasViolations = group.fail > 0;

              return (
                <div key={group.key} className={`border rounded-xl overflow-hidden transition-colors ${
                  groupFullyCompliant
                    ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/10'
                    : groupHasViolations
                      ? 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-900/10'
                      : 'border-gray-100 dark:border-gray-800'
                }`}>
                  <div className={`flex items-center gap-3 p-3 transition-colors ${
                    groupFullyCompliant
                      ? 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : groupHasViolations
                        ? 'hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                  }`}>
                    <button
                      onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className={`transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronRight size={14} className="text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{group.label}</span>
                          {tags.length > 0 && tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 text-[9px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded border border-blue-100 dark:border-blue-800">{tag}</span>
                          ))}
                          {resourceEntry?.region && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                              <MapPin size={9} />{resourceEntry.region}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex-1 max-w-[160px]">
                            <ScoreBar score={group.score} />
                          </div>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {group.pass}P · {group.fail}F · {group.ack}Ack · {total} total
                          </span>
                        </div>
                      </div>
                    </button>
                    {mode === 'resource' && resourceEntry && (
                      <button
                        onClick={() => setSelectedResource(resourceEntry)}
                        className="flex-shrink-0 px-2.5 py-1 text-[11px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      >
                        Details
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-4 space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Rule Breakdown</h4>
                          <div className="space-y-1.5">
                            {ruleList.map((rule, i) => {
                              const ruleScoreable = rule.pass + rule.fail + rule.ack;
                              const rulePct = ruleScoreable > 0 ? Math.round((rule.pass / ruleScoreable) * 100) : null;
                              return (
                                <div key={i} className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                                  <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: SEVERITY_COLOR[rule.severity] ?? '#94a3b8' }} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">{rule.name}</span>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <SeverityBadge severity={rule.severity} />
                                        <span className={`text-[11px] font-bold ${rulePct === 100 ? 'text-emerald-500' : rulePct != null && rulePct < 70 ? 'text-red-500' : 'text-amber-500'}`}>
                                          {rulePct != null ? `${rulePct}%` : '—'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                                      {rule.pass}P · {rule.fail}F · {rule.ack}Ack
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {uniqueResources && uniqueResources.size > 0 && (
                          <div>
                            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                              Affected Resources ({uniqueResources.size})
                            </h4>
                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                              {Array.from(uniqueResources.entries())
                                .sort((a, b) => (a[1].score ?? 101) - (b[1].score ?? 101))
                                .map(([rid, res]) => {
                                  const resResource = resourceMap.get(rid);
                                  return (
                                    <div key={rid} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                      res.score === 100
                                        ? 'bg-emerald-50/60 dark:bg-emerald-900/15 border-emerald-200/60 dark:border-emerald-800/40'
                                        : res.fail > 0
                                          ? 'bg-red-50/60 dark:bg-red-900/15 border-red-200/60 dark:border-red-800/40'
                                          : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
                                    }`}>
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate block">{res.label}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="text-[9px] text-gray-400 dark:text-gray-500">{RESOURCE_TYPE_LABELS[res.type] ?? res.type}</span>
                                          {res.region && <span className="text-[9px] text-gray-400 dark:text-gray-500">· {res.region}</span>}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <ScoreBar score={res.score} size="sm" />
                                        {resResource && (
                                          <button
                                            onClick={() => setSelectedResource(resResource)}
                                            className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline"
                                          >
                                            View
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Passing', value: group.pass, color: 'text-emerald-600 dark:text-emerald-400' },
                          { label: 'Failing', value: group.fail, color: 'text-red-500 dark:text-red-400' },
                          { label: 'Acknowledged', value: group.ack, color: 'text-gray-500 dark:text-gray-400' },
                          { label: 'N/A', value: group.na, color: 'text-gray-400 dark:text-gray-500' },
                        ].map(stat => (
                          <div key={stat.label} className="text-center p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                            <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">{stat.label}</div>
                          </div>
                        ))}
                      </div>
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
