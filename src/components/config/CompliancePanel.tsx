import { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, ShieldAlert, Shield, Play, ChevronDown, ChevronUp,
  Server, HardDrive, Network, Database, Container, Package,
  CheckCircle, MinusCircle, Loader2, Tag, Users, ListChecks,
  CheckCheck, RotateCcw, X, AlertCircle, GitMerge, MessageSquarePlus, StickyNote, Trash2,
} from 'lucide-react';
import {
  getComplianceRules, getComplianceResults,
  runComplianceEvaluation, acknowledgeComplianceResult, unacknowledgeComplianceResult,
  getAccountTimestamps, getComplianceResultNotes, addComplianceResultNote, deleteComplianceResultNote,
} from '../../lib/api';
import type { ComplianceResultNote } from '../../lib/api';
import type { ComplianceRule, ComplianceResult } from '../../types';

interface CompliancePanelProps {
  accountId: string;
  onSummaryChange?: (summary: any) => void;
  onNavigateToRuleManager?: () => void;
  syncTrigger?: number;
  readOnly?: boolean;
}

const resourceTypeIcons: Record<string, any> = {
  linode: Server,
  volume: HardDrive,
  nodebalancer: Network,
  database: Database,
  lke_cluster: Container,
  firewall: Shield,
  object_storage: Package,
  account_users: Users,
};

const severityConfig = {
  critical: { label: 'Critical', classes: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' },
  warning: { label: 'Warning', classes: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700' },
  info: { label: 'Info', classes: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700' },
};

const statusConfig = {
  compliant: { label: 'Compliant', icon: CheckCircle, classes: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  non_compliant: { label: 'Non-Compliant', icon: ShieldAlert, classes: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  not_applicable: { label: 'N/A', icon: MinusCircle, classes: 'text-gray-400 dark:text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
};

const RULE_GROUPS = [
  {
    key: 'network',
    label: 'Network & Firewalls',
    icon: Shield,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    conditionTypes: ['firewall_attached', 'firewall_rules_check', 'firewall_has_targets', 'no_open_inbound', 'firewall_rfc1918_lateral', 'firewall_rule_descriptions', 'firewall_no_duplicate_rules', 'firewall_all_ports_allowed'],
  },
  {
    key: 'database',
    label: 'Databases',
    icon: Database,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    conditionTypes: ['db_allowlist_check', 'db_public_access'],
  },
  {
    key: 'storage',
    label: 'Object Storage',
    icon: Package,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',
    conditionTypes: ['bucket_acl_check', 'bucket_cors_check'],
  },
  {
    key: 'kubernetes',
    label: 'Kubernetes',
    icon: Container,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800',
    conditionTypes: ['min_node_count', 'lke_control_plane_ha', 'lke_audit_logs_enabled'],
  },
  {
    key: 'nodebalancer',
    label: 'NodeBalancers',
    icon: Network,
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800',
    conditionTypes: ['nodebalancer_protocol_check', 'nodebalancer_port_allowlist'],
  },
  {
    key: 'block_storage',
    label: 'Block Storage',
    icon: HardDrive,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    conditionTypes: ['volume_encryption_enabled'],
  },
  {
    key: 'governance',
    label: 'Governance & Tagging',
    icon: Tag,
    color: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800',
    conditionTypes: ['has_tags', 'approved_regions', 'volume_attached'],
  },
  {
    key: 'identity',
    label: 'Identity & Access',
    icon: Users,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    conditionTypes: ['tfa_users', 'login_allowed_ips'],
  },
  {
    key: 'instance_health',
    label: 'Instance Health & Security',
    icon: Server,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
    conditionTypes: ['linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption', 'linode_lock_configured', 'linode_not_offline', 'linode_plan_tier_by_tag'],
  },
  {
    key: 'composite',
    label: 'Composite Rules',
    icon: GitMerge,
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700',
    conditionTypes: ['composite'],
  },
];

function getGroupForRule(rule: ComplianceRule): string {
  const match = RULE_GROUPS.find(g => g.conditionTypes.includes(rule.condition_type));
  return match ? match.key : 'other';
}

interface AckModalState {
  resultId: string | null;
  resultIds?: string[];
  ruleId?: string;
  resourceLabel: string;
  note: string;
  isBulk?: boolean;
}

export function CompliancePanel({ accountId, onSummaryChange, onNavigateToRuleManager, syncTrigger, readOnly = false }: CompliancePanelProps) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(RULE_GROUPS.map(g => g.key)));
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'non_compliant' | 'compliant'>('all');
  const [ruleTypeFilters, setRuleTypeFilters] = useState<Record<string, string>>({});
  const [ruleStatusFilters, setRuleStatusFilters] = useState<Record<string, string>>({});
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [ackModal, setAckModal] = useState<AckModalState | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);
  const [selectedResults, setSelectedResults] = useState<Record<string, Set<string>>>({});
  const [bulkAcking, setBulkAcking] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [notesMap, setNotesMap] = useState<Record<string, ComplianceResultNote[]>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [addNoteFor, setAddNoteFor] = useState<{ resultId: string; accountId: string } | null>(null);
  const [addNoteText, setAddNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [addNoteError, setAddNoteError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const addNoteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { load(); }, [accountId]);

  useEffect(() => {
    if (syncTrigger !== undefined && syncTrigger > 0 && accountId) {
      getAccountTimestamps(accountId).then(ts => {
        setLastSyncAt(ts.last_sync_at);
        setLastEvaluatedAt(ts.last_evaluated_at);
      }).catch(() => {});
    }
  }, [syncTrigger]);

  useEffect(() => {
    if (ackModal && noteInputRef.current) {
      setTimeout(() => noteInputRef.current?.focus(), 50);
    }
  }, [ackModal]);

  async function load() {
    setLoading(true);
    try {
      const [r, res, timestamps] = await Promise.all([
        getComplianceRules(accountId),
        getComplianceResults(accountId),
        getAccountTimestamps(accountId),
      ]);
      setRules(r as ComplianceRule[]);
      setResults(res as ComplianceResult[]);
      computeSummary(res);
      setLastSyncAt(timestamps.last_sync_at);
      setLastEvaluatedAt(timestamps.last_evaluated_at);
    } catch {}
    setLoading(false);
  }

  function computeSummary(res: any[]) {
    const scored = res.filter(r => !r.acknowledged);
    const total = scored.length;
    const compliant = scored.filter(r => r.status === 'compliant').length;
    const non_compliant = scored.filter(r => r.status === 'non_compliant').length;
    const not_applicable = scored.filter(r => r.status === 'not_applicable').length;
    const acknowledged = res.filter(r => r.acknowledged).length;
    onSummaryChange?.({ total, compliant, non_compliant, not_applicable, acknowledged });
  }

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    try {
      await runComplianceEvaluation(accountId);
    } catch (e: any) {
      setRunError(e?.message || 'Evaluation failed');
      setRunning(false);
      return;
    }
    await load();
    setRunning(false);
  }

  function getResultsForRule(ruleId: string) {
    return results.filter(r => r.rule_id === ruleId);
  }

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAcknowledge(resultId: string, note: string) {
    setAckingId(resultId);
    try {
      await acknowledgeComplianceResult(resultId, note.trim() || undefined);
      setResults(prev => prev.map(r =>
        r.id === resultId
          ? { ...r, acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_note: note.trim() || null }
          : r
      ));
      setResults(prev => {
        computeSummary(prev.map(r => r.id === resultId ? { ...r, acknowledged: true } : r));
        return prev;
      });
    } catch {}
    setAckingId(null);
    setAckModal(null);
  }

  async function handleUnacknowledge(resultId: string) {
    setAckingId(resultId);
    try {
      await unacknowledgeComplianceResult(resultId);
      setResults(prev => {
        const updated = prev.map(r =>
          r.id === resultId
            ? { ...r, acknowledged: false, acknowledged_at: null, acknowledged_note: null }
            : r
        );
        computeSummary(updated);
        return updated;
      });
    } catch {}
    setAckingId(null);
  }

  async function handleBulkAcknowledge(ruleId: string, note: string) {
    const ids = Array.from(selectedResults[ruleId] || []);
    if (ids.length === 0) return;
    setBulkAcking(true);
    try {
      await Promise.all(ids.map(id => acknowledgeComplianceResult(id, note.trim() || undefined)));
      setResults(prev => {
        const updated = prev.map(r =>
          ids.includes(r.id)
            ? { ...r, acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_note: note.trim() || null }
            : r
        );
        computeSummary(updated);
        return updated;
      });
      setSelectedResults(p => ({ ...p, [ruleId]: new Set() }));
    } catch {}
    setBulkAcking(false);
    setAckModal(null);
  }

  async function handleBulkUnacknowledge(ruleId: string) {
    const ids = Array.from(selectedResults[ruleId] || []);
    if (ids.length === 0) return;
    setBulkAcking(true);
    try {
      await Promise.all(ids.map(id => unacknowledgeComplianceResult(id)));
      setResults(prev => {
        const updated = prev.map(r =>
          ids.includes(r.id)
            ? { ...r, acknowledged: false, acknowledged_at: null, acknowledged_note: null }
            : r
        );
        computeSummary(updated);
        return updated;
      });
      setSelectedResults(p => ({ ...p, [ruleId]: new Set() }));
    } catch {}
    setBulkAcking(false);
  }

  function toggleResultSelection(ruleId: string, resultId: string) {
    setSelectedResults(prev => {
      const set = new Set(prev[ruleId] || []);
      if (set.has(resultId)) set.delete(resultId);
      else set.add(resultId);
      return { ...prev, [ruleId]: set };
    });
  }

  function selectAllResults(ruleId: string, ids: string[]) {
    setSelectedResults(prev => ({ ...prev, [ruleId]: new Set(ids) }));
  }

  function clearSelection(ruleId: string) {
    setSelectedResults(prev => ({ ...prev, [ruleId]: new Set() }));
  }

  async function toggleNotes(resultId: string) {
    const isOpen = expandedNotes.has(resultId);
    if (isOpen) {
      setExpandedNotes(prev => { const n = new Set(prev); n.delete(resultId); return n; });
      return;
    }
    setExpandedNotes(prev => new Set(prev).add(resultId));
    if (!notesMap[resultId]) {
      try {
        const notes = await getComplianceResultNotes(resultId);
        setNotesMap(prev => ({ ...prev, [resultId]: notes }));
      } catch {}
    }
  }

  function openAddNote(resultId: string, accId: string) {
    setAddNoteFor({ resultId, accountId: accId });
    setAddNoteText('');
    setAddNoteError(null);
    setTimeout(() => addNoteInputRef.current?.focus(), 50);
  }

  async function submitAddNote() {
    if (!addNoteFor || !addNoteText.trim()) return;
    setAddingNote(true);
    setAddNoteError(null);
    const target = addNoteFor;
    try {
      const note = await addComplianceResultNote(target.resultId, target.accountId, addNoteText);
      setNotesMap(prev => ({
        ...prev,
        [target.resultId]: [...(prev[target.resultId] || []), note],
      }));
      setExpandedNotes(prev => new Set(prev).add(target.resultId));
      setAddNoteFor(null);
      setAddNoteText('');
    } catch (err: unknown) {
      setAddNoteError(err instanceof Error ? err.message : 'Failed to save note. Please try again.');
    }
    setAddingNote(false);
  }

  async function handleDeleteNote(resultId: string, noteId: string) {
    setDeletingNoteId(noteId);
    try {
      await deleteComplianceResultNote(noteId);
      setNotesMap(prev => ({
        ...prev,
        [resultId]: (prev[resultId] || []).filter(n => n.id !== noteId),
      }));
    } catch {}
    setDeletingNoteId(null);
  }

  const nonCompliantCount = results.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
  const acknowledgedCount = results.filter(r => r.acknowledged).length;
  const compliantCount = results.filter(r => r.status === 'compliant').length;

  const activeRules = rules.filter(r => r.is_active);
  const filteredRules = activeFilter === 'all'
    ? activeRules
    : activeRules.filter(r => {
        const rr = getResultsForRule(r.id);
        if (activeFilter === 'non_compliant') return rr.some(x => x.status === 'non_compliant' && !x.acknowledged);
        if (activeFilter === 'compliant') return rr.length > 0 && rr.every(x => x.status !== 'non_compliant' || x.acknowledged);
        return true;
      });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ackModal && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-50">
                  {ackModal.isBulk ? `Acknowledge ${ackModal.resultIds?.length} Violations` : 'Acknowledge Violation'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{ackModal.resourceLabel}</p>
              </div>
              <button onClick={() => setAckModal(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This violation will still be shown as non-compliant but will be excluded from the compliance score. Add an optional note to explain why it is being acknowledged.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Note (optional)</label>
                <textarea
                  ref={noteInputRef}
                  rows={3}
                  value={ackModal.note}
                  onChange={e => setAckModal(p => p ? { ...p, note: e.target.value } : null)}
                  placeholder="e.g. Known issue, ticket #1234 open to resolve"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 p-5 pt-0">
              <button
                onClick={() => setAckModal(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (ackModal.isBulk && ackModal.ruleId) {
                    handleBulkAcknowledge(ackModal.ruleId, ackModal.note);
                  } else if (ackModal.resultId) {
                    handleAcknowledge(ackModal.resultId, ackModal.note);
                  }
                }}
                disabled={ackModal.isBulk ? bulkAcking : ackingId === ackModal.resultId}
                className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {(ackModal.isBulk ? bulkAcking : ackingId === ackModal.resultId) ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                {ackModal.isBulk ? `Acknowledge ${ackModal.resultIds?.length} violations` : 'Acknowledge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addNoteFor && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <StickyNote size={15} className="text-amber-500" />
                <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-50">Add Follow-up Note</h3>
              </div>
              <button onClick={() => setAddNoteFor(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Add an additional note to this acknowledged finding. Notes are visible to all team members with access to this account.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Note</label>
                <textarea
                  ref={addNoteInputRef}
                  rows={4}
                  value={addNoteText}
                  onChange={e => setAddNoteText(e.target.value)}
                  placeholder="e.g. Reviewed in weekly security meeting, remediation scheduled for next sprint."
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAddNote(); }}
                />
              </div>
            </div>
            {addNoteError && (
              <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                {addNoteError}
              </div>
            )}
            <div className="flex items-center gap-2 p-5 pt-0">
              <button
                onClick={() => { setAddNoteFor(null); setAddNoteError(null); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAddNote}
                disabled={addingNote || !addNoteText.trim()}
                className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {addingNote ? <Loader2 size={13} className="animate-spin" /> : <MessageSquarePlus size={13} />}
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
              <CheckCircle size={14} /> {compliantCount} compliant
            </span>
            <span>·</span>
            <span className={`flex items-center gap-1 font-medium ${nonCompliantCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
              <ShieldAlert size={14} /> {nonCompliantCount} violations
            </span>
            {acknowledgedCount > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                  <CheckCheck size={14} /> {acknowledgedCount} acknowledged
                </span>
              </>
            )}
          </div>
          {onNavigateToRuleManager && (
            <button
              onClick={onNavigateToRuleManager}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <ListChecks size={13} /> Manage Rules
            </button>
          )}
        </div>
        {!readOnly && (
          <div className="relative inline-flex">
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? 'Evaluating…' : 'Run Evaluation'}
            </button>
            {!running && lastSyncAt && (!lastEvaluatedAt || new Date(lastSyncAt) > new Date(lastEvaluatedAt)) && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
              </span>
            )}
          </div>
        )}
      </div>

      {!running && lastSyncAt && (!lastEvaluatedAt || new Date(lastSyncAt) > new Date(lastEvaluatedAt)) && (
        <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>New resource data is available. Run evaluation to update compliance results.</span>
        </div>
      )}

      {runError && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <ShieldAlert size={14} className="flex-shrink-0" />
          <span>Evaluation error: {runError}</span>
          <button onClick={() => setRunError(null)} className="ml-auto text-red-400 hover:text-red-600 transition-colors"><X size={14} /></button>
        </div>
      )}

      {results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <ShieldCheck size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No evaluation results yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Click "Run Evaluation" to check your resources against all active rules.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex items-center gap-2">
          {(['all', 'non_compliant', 'compliant'] as const).map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? `All rules (${activeRules.length})` : f === 'non_compliant' ? `With violations` : `Fully compliant`}
            </button>
          ))}
        </div>
      )}

      {activeRules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <ListChecks size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No active rules</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Go to Rule Manager to enable or create rules for this account.</p>
        </div>
      )}

      {activeRules.length > 0 && (
        <div className="space-y-4">
          {RULE_GROUPS.map(group => {
            const groupRules = filteredRules.filter(r => getGroupForRule(r) === group.key);
            if (groupRules.length === 0) return null;

            const isGroupExpanded = expandedGroups.has(group.key);
            const GroupIcon = group.icon;

            const groupResults = groupRules.flatMap(r => getResultsForRule(r.id));
            const groupViolations = groupResults.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
            const groupCompliant = groupResults.filter(r => r.status === 'compliant').length;
            const groupNotEvaluated = groupRules.filter(r => getResultsForRule(r.id).length === 0).length;

            return (
              <div key={group.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className={`p-1.5 rounded-lg border ${group.bg}`}>
                    <GroupIcon size={14} className={group.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{group.label}</span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">{groupRules.length} rule{groupRules.length !== 1 ? 's' : ''}</span>
                      {groupViolations > 0 && (
                        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">{groupViolations} violation{groupViolations !== 1 ? 's' : ''}</span>
                      )}
                      {groupViolations === 0 && groupCompliant > 0 && (
                        <span className="text-[11px] font-medium text-green-600 dark:text-green-400">All compliant</span>
                      )}
                      {groupNotEvaluated > 0 && groupCompliant === 0 && groupViolations === 0 && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">Not evaluated</span>
                      )}
                    </div>
                  </div>
                  {isGroupExpanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
                </button>

                {isGroupExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {groupRules.map(rule => {
                      const ruleResults = getResultsForRule(rule.id);
                      const ruleNonCompliant = ruleResults.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
                      const ruleAcknowledged = ruleResults.filter(r => r.status === 'non_compliant' && r.acknowledged).length;
                      const ruleCompliantCount = ruleResults.filter(r => r.status === 'compliant').length;
                      const isExpanded = expandedRule === rule.id;
                      const sev = severityConfig[rule.severity as keyof typeof severityConfig] || severityConfig.info;
                      const hasMultipleTypes = rule.resource_types.length > 1;
                      const activeTypeFilter = ruleTypeFilters[rule.id] || 'all';
                      const ruleStatusFilter = ruleStatusFilters[rule.id] || 'all';

                      const displayResults = isExpanded
                        ? ruleResults.filter(r => {
                            const statusMatch = ruleStatusFilter === 'all' || r.status === ruleStatusFilter;
                            const typeMatch = !hasMultipleTypes || activeTypeFilter === 'all' || (r as any).resources?.resource_type === activeTypeFilter;
                            return statusMatch && typeMatch;
                          })
                        : [];

                      const ruleSelection = selectedResults[rule.id] || new Set<string>();
                      const selectableIds = displayResults.filter(r => r.status === 'non_compliant').map(r => r.id);
                      const selectedCount = selectableIds.filter(id => ruleSelection.has(id)).length;
                      const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
                      const someSelected = selectedCount > 0 && !allSelected;
                      const selectedAckedCount = selectableIds.filter(id => ruleSelection.has(id) && results.find(r => r.id === id)?.acknowledged).length;
                      const selectedUnackedCount = selectedCount - selectedAckedCount;

                      const ruleIsFullyCompliant = ruleResults.length > 0 && ruleNonCompliant === 0 && ruleAcknowledged === 0;
                      const ruleHasViolations = ruleNonCompliant > 0;

                      return (
                        <div key={rule.id} className={`transition-colors ${
                          ruleIsFullyCompliant
                            ? 'bg-emerald-50/60 dark:bg-emerald-900/10'
                            : ruleHasViolations
                              ? 'bg-red-50/60 dark:bg-red-900/10'
                              : 'bg-white dark:bg-gray-900'
                        }`}>
                          <div
                            className={`flex items-center gap-3 px-5 py-4 cursor-pointer transition-colors ${
                              ruleIsFullyCompliant
                                ? 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                : ruleHasViolations
                                  ? 'hover:bg-red-50 dark:hover:bg-red-900/20'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }`}
                            onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{rule.name}</span>
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${sev.classes}`}>
                                  {sev.label}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rule.description}</p>
                              {rule.resource_types.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {rule.resource_types.map(rt => {
                                    const Icon = resourceTypeIcons[rt] || Shield;
                                    return (
                                      <span key={rt} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                        <Icon size={9} />{rt.replace(/_/g, ' ')}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {ruleResults.length > 0 ? (
                                <div className="text-right">
                                  {ruleNonCompliant > 0 ? (
                                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">{ruleNonCompliant} violation{ruleNonCompliant !== 1 ? 's' : ''}</span>
                                  ) : (
                                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">All compliant</span>
                                  )}
                                  <p className="text-[10px] text-gray-400">
                                    {ruleResults.length} checked
                                    {ruleAcknowledged > 0 && <span className="text-amber-500 dark:text-amber-400"> · {ruleAcknowledged} ack'd</span>}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">Not evaluated</span>
                              )}
                              {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                            </div>
                          </div>

                          {isExpanded && ruleResults.length > 0 && (
                            <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-wrap">
                                {!readOnly && selectableIds.length > 0 && (
                                  <label className="flex items-center gap-1.5 cursor-pointer mr-1 flex-shrink-0" title={allSelected ? 'Deselect all' : 'Select all violations'}>
                                    <input
                                      type="checkbox"
                                      checked={allSelected}
                                      ref={el => { if (el) el.indeterminate = someSelected; }}
                                      onChange={() => allSelected || someSelected ? clearSelection(rule.id) : selectAllResults(rule.id, selectableIds)}
                                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 accent-amber-500 cursor-pointer"
                                    />
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 select-none">
                                      {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
                                    </span>
                                  </label>
                                )}
                                {!readOnly && selectedCount > 0 && (
                                  <div className="flex items-center gap-1.5 mr-auto">
                                    {selectedUnackedCount > 0 && (
                                      <button
                                        onClick={() => setAckModal({
                                          resultId: null,
                                          resultIds: selectableIds.filter(id => ruleSelection.has(id)),
                                          ruleId: rule.id,
                                          resourceLabel: `${selectedUnackedCount} violation${selectedUnackedCount !== 1 ? 's' : ''}`,
                                          note: '',
                                          isBulk: true,
                                        })}
                                        disabled={bulkAcking}
                                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                                      >
                                        {bulkAcking ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={10} />}
                                        Acknowledge {selectedUnackedCount}
                                      </button>
                                    )}
                                    {selectedAckedCount > 0 && (
                                      <button
                                        onClick={() => handleBulkUnacknowledge(rule.id)}
                                        disabled={bulkAcking}
                                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                      >
                                        {bulkAcking ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                                        Unacknowledge {selectedAckedCount}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => clearSelection(rule.id)}
                                      className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    >
                                      <X size={10} /> Clear
                                    </button>
                                  </div>
                                )}
                                {hasMultipleTypes && (
                                  <div className="flex items-center gap-1.5 flex-wrap flex-1">
                                    <button
                                      onClick={() => setRuleTypeFilters(p => ({ ...p, [rule.id]: 'all' }))}
                                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                                        activeTypeFilter === 'all'
                                          ? 'bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900'
                                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      All types
                                    </button>
                                    {rule.resource_types.map(rt => {
                                      const Icon = resourceTypeIcons[rt] || Shield;
                                      const cnt = ruleResults.filter(r => (r as any).resources?.resource_type === rt).length;
                                      if (cnt === 0) return null;
                                      return (
                                        <button
                                          key={rt}
                                          onClick={() => setRuleTypeFilters(p => ({ ...p, [rule.id]: rt }))}
                                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                                            activeTypeFilter === rt
                                              ? 'bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900'
                                              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                                          }`}
                                        >
                                          <Icon size={10} />{rt.replace(/_/g, ' ')}<span className="opacity-60">({cnt})</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className={`flex items-center gap-1 ${hasMultipleTypes ? 'ml-auto' : ''}`}>
                                  {([
                                    { value: 'all', label: 'All', count: ruleResults.length },
                                    { value: 'non_compliant', label: 'Violations', count: ruleResults.filter(r => r.status === 'non_compliant').length },
                                    { value: 'compliant', label: 'Compliant', count: ruleCompliantCount },
                                  ] as const).map(opt => (
                                    <button
                                      key={opt.value}
                                      onClick={() => setRuleStatusFilters(p => ({ ...p, [rule.id]: opt.value }))}
                                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                                        ruleStatusFilter === opt.value
                                          ? opt.value === 'non_compliant'
                                            ? 'bg-red-600 text-white'
                                            : opt.value === 'compliant'
                                            ? 'bg-green-600 text-white'
                                            : 'bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900'
                                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      {opt.label} <span className="opacity-70">({opt.count})</span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {displayResults.map(result => {
                                  const st = statusConfig[result.status as keyof typeof statusConfig] || statusConfig.not_applicable;
                                  const StatusIcon = st.icon;
                                  const resourceTags: string[] = (result as any).resources?.specs?.tags || [];
                                  const isTfaResult = rule.condition_type === 'tfa_users';
                                  const usernameMatch = isTfaResult && result.detail ? result.detail.match(/^User "([^"]+)"/) : null;
                                  const username = usernameMatch ? usernameMatch[1] : null;
                                  const isAcknowledged = (result as any).acknowledged === true;
                                  const acknowledgedNote: string | null = (result as any).acknowledged_note ?? null;
                                  const acknowledgedAt: string | null = (result as any).acknowledged_at ?? null;
                                  const acknowledger = (result as any).acknowledger as { id: string; email: string; full_name: string | null } | null;
                                  const acknowledgerLabel = acknowledger ? (acknowledger.full_name || acknowledger.email) : null;
                                  const isNonCompliant = result.status === 'non_compliant';
                                  const isAcking = ackingId === result.id;
                                  const resourceLabel = isTfaResult
                                    ? (username || 'Unknown user')
                                    : ((result as any).resources?.label || 'Unknown resource');

                                  const isSelected = ruleSelection.has(result.id);

                                  const resultIsCompliant = result.status === 'compliant';
                                  const resultBg = isSelected
                                    ? 'bg-amber-50/60 dark:bg-amber-900/15'
                                    : isAcknowledged
                                      ? 'bg-amber-50/40 dark:bg-amber-900/10'
                                      : resultIsCompliant
                                        ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
                                        : isNonCompliant
                                          ? 'bg-red-50/50 dark:bg-red-900/10'
                                          : '';

                                  const notesOpen = expandedNotes.has(result.id);
                                  const resultNotes = notesMap[result.id] || [];

                                  return (
                                    <div key={result.id} className={`transition-colors ${resultBg}`}>
                                      <div className={`flex items-start gap-3 px-5 py-3 group`}>
                                      {isNonCompliant ? (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleResultSelection(rule.id, result.id)}
                                          onClick={e => e.stopPropagation()}
                                          className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 rounded border-gray-300 dark:border-gray-600 accent-amber-500 cursor-pointer"
                                        />
                                      ) : (
                                        <span className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                      )}
                                      <StatusIcon
                                        size={14}
                                        className={`mt-0.5 flex-shrink-0 ${isAcknowledged ? 'opacity-40' : ''} ${st.classes}`}
                                      />
                                      <div className="flex-1 min-w-0">
                                        {isTfaResult ? (
                                          <p className={`text-xs font-medium flex items-center gap-1.5 ${isAcknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                                            <Users size={11} className="text-gray-400 flex-shrink-0" />
                                            {username || 'Unknown user'}
                                            <span className="text-[10px] text-gray-400 font-normal">account user</span>
                                          </p>
                                        ) : (
                                          <p className={`text-xs font-medium truncate ${isAcknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {(result as any).resources?.label || 'Unknown resource'}
                                            <span className="ml-1.5 text-[10px] text-gray-400 capitalize">{(result as any).resources?.resource_type?.replace(/_/g, ' ')}</span>
                                          </p>
                                        )}
                                        {result.detail && (
                                          <div className={`text-[11px] mt-0.5 ${isAcknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {result.detail.split(/;\s+/).map((item, i) => (
                                              <p key={i} className={i > 0 ? 'mt-0.5' : ''}>{item}</p>
                                            ))}
                                          </div>
                                        )}
                                        {isAcknowledged && (
                                          <div className="flex items-start gap-1 mt-1.5">
                                            <CheckCheck size={10} className="text-amber-500 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                                Acknowledged
                                                {acknowledgedAt && (
                                                  <span className="text-amber-500/70 dark:text-amber-500/70"> · {new Date(acknowledgedAt).toLocaleString()}</span>
                                                )}
                                                {acknowledger?.email && (
                                                  <span className="text-amber-500/70 dark:text-amber-500/70"> · {acknowledger.email}</span>
                                                )}
                                                {acknowledgedNote && (
                                                  <span className="text-amber-600/80 dark:text-amber-400/80"> — {acknowledgedNote}</span>
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                        {isAcknowledged && (
                                          <div className="flex items-center gap-2 mt-1.5">
                                            <button
                                              onClick={e => { e.stopPropagation(); toggleNotes(result.id); }}
                                              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                                            >
                                              <StickyNote size={10} />
                                              {notesOpen ? 'Hide notes' : `Notes${resultNotes.length > 0 ? ` (${resultNotes.length})` : ''}`}
                                              {notesOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                                            </button>
                                            {!readOnly && (
                                              <button
                                                onClick={e => { e.stopPropagation(); openAddNote(result.id, accountId); }}
                                                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                                              >
                                                <MessageSquarePlus size={10} />
                                                Add note
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        {resourceTags.length > 0 && (
                                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                            <Tag size={9} className="text-gray-400 flex-shrink-0" />
                                            {resourceTags.map(tag => (
                                              <span key={tag} className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700">
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        {!readOnly && isNonCompliant && (
                                          isAcknowledged ? (
                                            <button
                                              onClick={e => { e.stopPropagation(); handleUnacknowledge(result.id); }}
                                              disabled={isAcking}
                                              title="Remove acknowledgement"
                                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all disabled:opacity-40"
                                            >
                                              {isAcking ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                                              Unacknowledge
                                            </button>
                                          ) : (
                                            <button
                                              onClick={e => { e.stopPropagation(); setAckModal({ resultId: result.id, resourceLabel, note: '' }); }}
                                              disabled={isAcking}
                                              title="Acknowledge this violation"
                                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-300 dark:hover:border-amber-600 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all disabled:opacity-40"
                                            >
                                              {isAcking ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={10} />}
                                              Acknowledge
                                            </button>
                                          )
                                        )}
                                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${isAcknowledged ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400' : `${st.bg} ${st.classes}`}`}>
                                          {isAcknowledged ? 'Acknowledged' : st.label}
                                        </span>
                                      </div>
                                      </div>
                                      {isAcknowledged && notesOpen && (
                                        <div className="ml-[calc(3.5rem+1.25rem+0.75rem)] mr-5 mb-3 rounded-lg border border-amber-100 dark:border-amber-800/40 overflow-hidden">
                                          {resultNotes.length === 0 ? (
                                            <p className="px-3 py-2.5 text-[11px] text-gray-400 dark:text-gray-500 italic">No additional notes yet.</p>
                                          ) : (
                                            <div className="divide-y divide-amber-100 dark:divide-amber-800/30">
                                              {resultNotes.map(n => (
                                                <div key={n.id} className="px-3 py-2.5 bg-amber-50/40 dark:bg-amber-900/10 group/note flex items-start gap-2">
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">{n.note}</p>
                                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                                      {n.author?.email ?? 'Unknown user'} · {new Date(n.created_at).toLocaleString()}
                                                    </p>
                                                  </div>
                                                  {!readOnly && (
                                                    <button
                                                      onClick={e => { e.stopPropagation(); handleDeleteNote(result.id, n.id); }}
                                                      disabled={deletingNoteId === n.id}
                                                      title="Delete note"
                                                      className="opacity-0 group-hover/note:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0 disabled:opacity-40"
                                                    >
                                                      {deletingNoteId === n.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                                    </button>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {displayResults.length === 0 && (
                                  <div className="px-5 py-3 text-xs text-gray-400">No results match the current filter.</div>
                                )}
                              </div>
                            </div>
                          )}

                          {isExpanded && ruleResults.length === 0 && (
                            <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 text-xs text-gray-400 text-center">
                              No results yet — run an evaluation to check this rule.
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredRules.length === 0 && (
                      <div className="px-5 py-4 text-xs text-gray-400">No rules match the selected filter.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredRules.length === 0 && activeRules.length > 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No rules match the selected filter.</p>
          )}
        </div>
      )}
    </div>
  );
}
