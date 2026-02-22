import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Shield, ShieldCheck, Lock, FileCheck, CreditCard, Wrench,
  CheckCircle, ChevronDown, ChevronUp, AlertTriangle, Info, Zap,
  Check, RefreshCw, BookOpen, Star,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  getComplianceProfiles,
  getActiveProfileForAccount,
  setActiveProfileForAccount,
  clearActiveProfileForAccount,
  getComplianceRules,
  applyProfileRules,
} from '../../lib/api';
import type { ComplianceProfile, AccountComplianceProfile } from '../../lib/api';
import type { ComplianceRule } from '../../types';

interface ProfilesViewProps {
  accountId: string;
}

const TIER_ORDER: Record<string, number> = {
  foundation: 0,
  standard: 1,
  strict: 2,
  internal: 3,
  custom: 4,
};

const TIER_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  foundation: {
    label: 'Foundation',
    color: 'text-sky-700 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    border: 'border-sky-200 dark:border-sky-800',
  },
  standard: {
    label: 'Standard',
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
  },
  strict: {
    label: 'Strict',
    color: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    border: 'border-rose-200 dark:border-rose-800',
  },
  internal: {
    label: 'Internal',
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
  },
  custom: {
    label: 'Custom',
    color: 'text-teal-700 dark:text-teal-400',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    border: 'border-teal-200 dark:border-teal-800',
  },
};

const PROFILE_ICONS: Record<string, typeof Shield> = {
  'shield': Shield,
  'shield-check': ShieldCheck,
  'lock': Lock,
  'file-check': FileCheck,
  'credit-card': CreditCard,
  'wrench': Wrench,
};

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', order: 0 },
  warning: { label: 'Warning', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', order: 1 },
  info: { label: 'Info', color: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-400', order: 2 },
};

const CONDITION_LABELS: Record<string, { label: string; category: string }> = {
  firewall_attached: { label: 'Linodes must have a firewall', category: 'Network' },
  firewall_rules_check: { label: 'Firewall meets policy requirements', category: 'Network' },
  firewall_has_targets: { label: 'Firewalls have attached resources', category: 'Network' },
  no_open_inbound: { label: 'No unrestricted inbound traffic', category: 'Network' },
  db_allowlist_check: { label: 'Database IP allow list check', category: 'Database' },
  db_public_access: { label: 'Database public access disabled', category: 'Database' },
  bucket_acl_check: { label: 'Object storage bucket ACL', category: 'Storage' },
  bucket_cors_check: { label: 'Object storage bucket CORS', category: 'Storage' },
  min_node_count: { label: 'LKE minimum node count', category: 'Kubernetes' },
  lke_control_plane_ha: { label: 'LKE control plane HA enabled', category: 'Kubernetes' },
  lke_audit_logs_enabled: { label: 'LKE audit logs enabled', category: 'Kubernetes' },
  lke_control_plane_acl: { label: 'LKE control plane ACL configured', category: 'Kubernetes' },
  has_tags: { label: 'Resources have required tags', category: 'Governance' },
  volume_attached: { label: 'Volumes are attached', category: 'Storage' },
  volume_encryption_enabled: { label: 'Volume encryption enabled', category: 'Storage' },
  approved_regions: { label: 'Resources in approved regions', category: 'Governance' },
  tfa_users: { label: 'All users have TFA enabled', category: 'Identity' },
  login_allowed_ips: { label: 'Logins from allowed IPs only', category: 'Identity' },
  linode_backups_enabled: { label: 'Linode backups enabled', category: 'Data Protection' },
  linode_backup_recency: { label: 'Linode has recent backup', category: 'Data Protection' },
  linode_disk_encryption: { label: 'Linode disk encryption enabled', category: 'Data Protection' },
  linode_lock_configured: { label: 'Linode deletion lock configured', category: 'Resilience' },
  linode_not_offline: { label: 'Linode instances not offline', category: 'Resilience' },
  nodebalancer_protocol_check: { label: 'NodeBalancer protocol check', category: 'Network' },
  nodebalancer_port_allowlist: { label: 'NodeBalancer allowed ports', category: 'Network' },
  firewall_rfc1918_lateral: { label: 'No lateral movement via private IPs', category: 'Network' },
  firewall_rule_descriptions: { label: 'Firewall rules have descriptions', category: 'Network' },
  firewall_no_duplicate_rules: { label: 'No duplicate firewall rules', category: 'Network' },
  linode_plan_tier_by_tag: { label: 'Plan tier meets tag requirements', category: 'Governance' },
};

const PROFILE_FRAMEWORK_NOTES: Record<string, { framework: string; version: string; description: string; controls: string[]; disclaimer: string }> = {
  'cis-l1': {
    framework: 'Foundational Controls',
    version: 'Level 1',
    description: 'Covers foundational, low-friction controls — the checks that every cloud account should satisfy regardless of risk appetite.',
    controls: ['Identity & access hardening', 'Network segmentation basics', 'Data backup & recovery', 'Database exposure checks'],
    disclaimer: '',
  },
  'cis-l2': {
    framework: 'Standard Controls',
    version: 'Level 2',
    description: 'Adds deeper technical controls on top of the foundational set, appropriate for production workloads requiring defense in depth.',
    controls: ['Full encryption at rest', 'Kubernetes control plane hardening', 'Stricter access controls', 'Audit logging & monitoring'],
    disclaimer: '',
  },
  'all-rules': {
    framework: 'Complete Coverage',
    version: 'All Rules',
    description: 'Enables every available compliance rule. Use this to get full visibility across all checks — useful for auditing, onboarding, or building a custom baseline.',
    controls: ['All network controls', 'All encryption checks', 'All access controls', 'All Kubernetes controls', 'All storage checks', 'All operational checks'],
    disclaimer: '',
  },
  'soc2': {
    framework: 'Inspired by SOC 2',
    version: 'Trust Service Criteria (spirit)',
    description: 'Covers controls thematically aligned with the SOC 2 Trust Service Criteria areas of Security, Availability, and Confidentiality. Useful as a starting point before engaging a licensed CPA firm for an official audit.',
    controls: ['Logical access controls', 'Authentication hardening', 'Network protection', 'System availability & backups', 'Confidentiality of stored data'],
    disclaimer: 'Not an official SOC 2 audit or attestation. SOC 2 is a registered service mark of the AICPA.',
  },
  'pci-dss': {
    framework: 'Inspired by PCI-DSS',
    version: 'v4.0 (spirit)',
    description: 'Covers controls thematically aligned with PCI DSS network security, secure configuration, data protection, and access control requirements. A full PCI DSS assessment requires a Qualified Security Assessor (QSA).',
    controls: ['Network security controls', 'Secure system configurations', 'Encryption of stored data', 'Restrict access by need-to-know', 'Audit log coverage'],
    disclaimer: 'Not an official PCI DSS assessment. PCI DSS is a trademark of PCI Security Standards Council, LLC.',
  },
  'minimal-dev': {
    framework: 'Internal / Operational',
    version: 'Dev & Staging',
    description: 'Only flags critical blocking issues that represent immediate security exposure. Designed to avoid compliance noise on non-production environments.',
    controls: ['Critical inbound network exposure', 'Database public access'],
    disclaimer: '',
  },
};

export function ProfilesView({ accountId }: ProfilesViewProps) {
  const { isReadOnly } = useAuth();
  const [profiles, setProfiles] = useState<ComplianceProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<AccountComplianceProfile | null>(null);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activationResult, setActivationResult] = useState<{ enabled: number; disabled: number; profileName: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profs, active, ruleList] = await Promise.all([
        getComplianceProfiles(),
        getActiveProfileForAccount(accountId),
        getComplianceRules(accountId),
      ]);
      setProfiles(profs.sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)));
      setActiveProfile(active);
      setRules(ruleList as ComplianceRule[]);
    } catch (e) {
      setError('Failed to load profiles. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async (profileId: string) => {
    setActivating(profileId);
    setError(null);
    setActivationResult(null);
    try {
      const profile = profiles.find(p => p.id === profileId);
      await setActiveProfileForAccount(accountId, profileId);
      const result = profile ? await applyProfileRules(accountId, profile) : { enabled: 0, disabled: 0 };
      await load();
      if (profile) {
        setActivationResult({ ...result, profileName: profile.name });
        setTimeout(() => setActivationResult(null), 6000);
      }
    } catch (e) {
      setError('Failed to activate profile.');
    } finally {
      setActivating(null);
    }
  };

  const handleDeactivate = async () => {
    setActivating('clear');
    setError(null);
    try {
      await clearActiveProfileForAccount(accountId);
      setActiveProfile(null);
    } catch (e) {
      setError('Failed to deactivate profile.');
    } finally {
      setActivating(null);
    }
  };

  const activeProfileId = activeProfile?.profile_id;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">Compliance Profiles</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl">
            Choose a security profile to define which rules are in scope for this account. Profiles are independently developed controls inspired by the spirit of industry frameworks — see the disclaimer below.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {activationResult && (
        <div className="flex items-start gap-3 p-3.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 animate-fade-in">
          <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">{activationResult.profileName} activated.</span>
            {' '}Rules updated: <span className="font-medium">{activationResult.enabled} enabled</span>, <span className="font-medium">{activationResult.disabled} disabled</span>.
          </div>
        </div>
      )}

      {activeProfileId && (
        <ActiveProfileBanner
          profile={profiles.find(p => p.id === activeProfileId) ?? null}
          onDeactivate={handleDeactivate}
          deactivating={activating === 'clear'}
          readOnly={isReadOnly}
        />
      )}

      <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex gap-3">
        <Info size={15} className="text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed space-y-1">
          <p>
            <strong className="text-gray-600 dark:text-gray-300">Disclaimer:</strong> These profiles are independently developed and are not affiliated with or endorsed by the AICPA (SOC 2) or the PCI Security Standards Council (PCI-DSS). They are intended as a practical starting point for cloud security hygiene on Linode infrastructure — not as a substitute for an official audit or certification engagement.
          </p>
          <p>
            <strong className="text-gray-600 dark:text-gray-300">Note:</strong> Activating a profile automatically enables the rules in scope for this account and disables the rest. You can still adjust individual rules at any time in the Rule Manager — per-rule changes override the profile.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">
          <RefreshCw size={16} className="animate-spin mr-2" />
          Loading profiles...
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              rules={rules}
              isActive={profile.id === activeProfileId}
              isExpanded={expandedProfile === profile.id}
              isActivating={activating === profile.id}
              onToggleExpand={() => setExpandedProfile(expandedProfile === profile.id ? null : profile.id)}
              onActivate={() => handleActivate(profile.id)}
              readOnly={isReadOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveProfileBanner({
  profile,
  onDeactivate,
  deactivating,
  readOnly,
}: {
  profile: ComplianceProfile | null;
  onDeactivate: () => void;
  deactivating: boolean;
  readOnly: boolean;
}) {
  if (!profile) return null;
  const ProfileIcon = PROFILE_ICONS[profile.icon] ?? Shield;
  const tier = TIER_META[profile.tier] ?? TIER_META.custom;

  return (
    <div className="flex items-center gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
        <ProfileIcon size={18} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Active Profile</p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${tier.color} ${tier.bg}`}>
            {tier.label}
          </span>
        </div>
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mt-0.5">{profile.name}</p>
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{profile.rule_condition_types.length} rule types in scope</p>
      </div>
      {!readOnly && (
        <button
          onClick={onDeactivate}
          disabled={deactivating}
          className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 font-medium px-3 py-1.5 border border-emerald-300 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
        >
          {deactivating ? 'Removing...' : 'Remove'}
        </button>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  rules,
  isActive,
  isExpanded,
  isActivating,
  onToggleExpand,
  onActivate,
  readOnly,
}: {
  profile: ComplianceProfile;
  rules: ComplianceRule[];
  isActive: boolean;
  isExpanded: boolean;
  isActivating: boolean;
  onToggleExpand: () => void;
  onActivate: () => void;
  readOnly: boolean;
}) {
  const ProfileIcon = PROFILE_ICONS[profile.icon] ?? Shield;
  const tier = TIER_META[profile.tier] ?? TIER_META.custom;
  const frameworkNote = PROFILE_FRAMEWORK_NOTES[profile.slug];

  const inScopeRules = rules.filter(r => profile.rule_condition_types.includes(r.condition_type));
  const criticalCount = inScopeRules.filter(r => r.severity === 'critical').length;
  const warningCount = inScopeRules.filter(r => r.severity === 'warning').length;
  const infoCount = inScopeRules.filter(r => r.severity === 'info').length;

  const groupedConditions = profile.rule_condition_types.reduce((acc, ct) => {
    const meta = CONDITION_LABELS[ct];
    const cat = meta?.category ?? 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ct);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      isActive
        ? 'border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-100 dark:shadow-emerald-900/20'
        : 'border-gray-200 dark:border-gray-800'
    } bg-white dark:bg-gray-900`}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl flex-shrink-0 ${tier.bg} border ${tier.border}`}>
            <ProfileIcon size={20} className={tier.color} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50">{profile.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${tier.color} ${tier.bg} border ${tier.border}`}>
                    {tier.label}
                  </span>
                  {isActive && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      <Check size={9} /> Active
                    </span>
                  )}
                  {profile.is_builtin && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <BookOpen size={9} /> Built-in
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed max-w-2xl">{profile.description}</p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onToggleExpand}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                >
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {isExpanded ? 'Less' : 'Details'}
                </button>
                {!isActive && !readOnly && (
                  <button
                    onClick={onActivate}
                    disabled={isActivating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isActivating ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
                    {isActivating ? 'Activating...' : 'Activate'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                <strong className="text-gray-700 dark:text-gray-300">{profile.rule_condition_types.length}</strong> rule types
              </span>
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  <strong className="text-gray-700 dark:text-gray-300">{criticalCount}</strong>
                  <span className="text-gray-500 dark:text-gray-400">critical</span>
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  <strong className="text-gray-700 dark:text-gray-300">{warningCount}</strong>
                  <span className="text-gray-500 dark:text-gray-400">warning</span>
                </span>
              )}
              {infoCount > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                  <strong className="text-gray-700 dark:text-gray-300">{infoCount}</strong>
                  <span className="text-gray-500 dark:text-gray-400">info</span>
                </span>
              )}
              {frameworkNote && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {frameworkNote.framework} · {frameworkNote.version}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {frameworkNote && (
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <Star size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {frameworkNote.framework} — {frameworkNote.version}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-2">{frameworkNote.description}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {frameworkNote.controls.map((c, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300">
                        {c}
                      </span>
                    ))}
                  </div>
                  {frameworkNote.disclaimer && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-relaxed">
                      {frameworkNote.disclaimer}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="px-5 pt-3 pb-5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">In-Scope Controls</p>
            <div className="space-y-4">
              {Object.entries(groupedConditions).map(([category, conditionTypes]) => (
                <div key={category}>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">{category}</p>
                  <div className="space-y-1">
                    {conditionTypes.map(ct => {
                      const rule = rules.find(r => r.condition_type === ct);
                      const meta = CONDITION_LABELS[ct];
                      const sev = rule ? SEVERITY_CONFIG[rule.severity as keyof typeof SEVERITY_CONFIG] : null;
                      return (
                        <div key={ct} className="flex items-center gap-2.5 py-1.5 px-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                          {rule ? (
                            <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
                          ) : (
                            <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                          )}
                          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">
                            {meta?.label ?? ct}
                          </span>
                          {sev ? (
                            <span className={`text-[10px] font-semibold flex items-center gap-1 ${sev.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sev.dot} inline-block`} />
                              {sev.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">No rule</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {profile.rule_condition_types.some(ct => !rules.find(r => r.condition_type === ct)) && (
              <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-lg">
                <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  Some controls in this profile do not have a corresponding rule configured for this account. Create the rules in Rule Manager to fully implement this profile.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
