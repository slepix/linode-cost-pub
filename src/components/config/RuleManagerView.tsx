import { useState, useEffect } from 'react';
import {
  Shield, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Loader2,
  Server, HardDrive, Network, Database, Container, Package, Users,
  MapPin, Tag, ChevronDown, ChevronUp, X, BookOpen, Lock, ShieldOff, GitMerge,
} from 'lucide-react';
import {
  getComplianceRules, createComplianceRule, deleteComplianceRule, updateComplianceRule, toggleRuleForAccount,
  getActiveProfileForAccount,
} from '../../lib/api';
import type { ComplianceRule } from '../../types';
import { CompositeRuleBuilder, validateCompositeConfig } from './CompositeRuleBuilder';
import type { CompositeConfig } from './CompositeRuleBuilder';
import { useAuth } from '../../lib/auth';

interface RuleManagerViewProps {
  accountId: string;
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
    conditionTypes: ['volume_encryption_enabled', 'volume_attached'],
  },
  {
    key: 'governance',
    label: 'Governance & Tagging',
    icon: Tag,
    color: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800',
    conditionTypes: ['has_tags', 'approved_regions'],
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
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800',
    conditionTypes: ['composite'],
  },
];

const CONDITION_TYPES = [
  { value: 'firewall_attached', label: 'Linode has firewall attached', resourceTypes: ['linode'], defaultName: 'All Linodes must have a firewall attached', defaultDescription: 'Checks that every Linode instance has at least one firewall attached to protect against unwanted inbound traffic.' },
  { value: 'firewall_rules_check', label: 'Linode firewall meets custom rules', resourceTypes: ['linode'], defaultName: 'Firewall rules meet policy requirements', defaultDescription: 'Validates that the firewall(s) attached to each Linode comply with the configured inbound/outbound policy, blocked ports, and allowed source IPs.' },
  { value: 'firewall_has_targets', label: 'Firewall has attached resources', resourceTypes: ['firewall'], defaultName: 'Firewalls must have attached Linodes', defaultDescription: 'Flags firewalls that are not protecting any Linode instances, which may indicate orphaned or misconfigured firewall rules.' },
  { value: 'no_open_inbound', label: 'No unrestricted inbound traffic', resourceTypes: ['firewall'], defaultName: 'No unrestricted inbound access on sensitive ports', defaultDescription: 'Checks that firewall rules do not allow unrestricted inbound access (0.0.0.0/0 or ::/0) on sensitive ports such as SSH (22), RDP (3389), MySQL (3306), or PostgreSQL (5432).' },
  { value: 'bucket_acl_check', label: 'Object storage bucket ACL policy', resourceTypes: ['object_storage'], defaultName: 'Object storage buckets must not be publicly readable', defaultDescription: 'Ensures object storage buckets are not set to a public ACL (public-read, public-read-write, or authenticated-read) unless explicitly permitted.' },
  { value: 'bucket_cors_check', label: 'Object storage bucket CORS setting', resourceTypes: ['object_storage'], defaultName: 'Object storage bucket CORS configuration', defaultDescription: 'Validates the CORS setting on object storage buckets according to the configured policy (require enabled or require disabled).' },
  { value: 'min_node_count', label: 'Minimum node count (LKE)', resourceTypes: ['lke_cluster'], defaultName: 'LKE clusters must have a minimum number of nodes', defaultDescription: 'Ensures Kubernetes clusters are running at least the required number of nodes to maintain high availability and workload capacity.' },
  { value: 'lke_control_plane_ha', label: 'Control plane high availability enabled', resourceTypes: ['lke_cluster'], defaultName: 'LKE clusters must have control plane HA enabled', defaultDescription: 'Checks that the Kubernetes control plane is configured for high availability, ensuring the API server remains operational during infrastructure failures.' },
  { value: 'lke_audit_logs_enabled', label: 'Control plane audit logs enabled', resourceTypes: ['lke_cluster'], defaultName: 'LKE clusters must have audit logs enabled', defaultDescription: 'Checks that control plane audit logging is enabled on every LKE cluster to record API server activity for security monitoring and compliance purposes.' },
  { value: 'has_tags', label: 'Resource has required tags', resourceTypes: ['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database'], defaultName: 'Resources must have required tags', defaultDescription: 'Checks that resources carry the specified tags (e.g. owner, environment, cost-center) to ensure consistent labelling and cost attribution across the account.' },
  { value: 'volume_attached', label: 'Volume is attached', resourceTypes: ['volume'], defaultName: 'Volumes must be attached to a Linode', defaultDescription: 'Flags block storage volumes that are not attached to any Linode instance, which may be unused and incurring unnecessary costs.' },
  { value: 'volume_encryption_enabled', label: 'Volume disk encryption is enabled', resourceTypes: ['volume'], defaultName: 'Block storage volumes must have encryption enabled', defaultDescription: 'Checks that disk encryption is enabled on every block storage volume to protect data at rest from unauthorised access.' },
  { value: 'approved_regions', label: 'Resource in approved region', resourceTypes: ['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database', 'object_storage'], defaultName: 'Resources must be deployed in approved regions', defaultDescription: 'Ensures all resources are located in approved geographic regions to meet data residency, compliance, or latency requirements.' },
  { value: 'tfa_users', label: 'All account users have TFA enabled', resourceTypes: [], defaultName: 'All account users must have TFA enabled', defaultDescription: 'Verifies that every user on the account (excluding proxy users) has two-factor authentication (TFA) configured to strengthen account security.' },
  { value: 'login_allowed_ips', label: 'Login from allowed IP address only', resourceTypes: [], defaultName: 'Account logins must originate from allowed IPs', defaultDescription: 'Checks account login history and flags any login that originates from an IP address not in the configured allow list, helping detect unauthorized access attempts.' },
  { value: 'db_allowlist_check', label: 'Database IP allow list check', resourceTypes: ['database'], defaultName: 'Databases must not allow unrestricted IP access', defaultDescription: 'Checks the database IP allow list for overly permissive CIDRs (e.g. 0.0.0.0/0) that would expose the database to the public internet.' },
  { value: 'db_public_access', label: 'Database public access check', resourceTypes: ['database'], defaultName: 'Databases must not have public access enabled', defaultDescription: 'Flags managed database instances that have public access enabled, making them reachable from outside the VPC network.' },
  { value: 'linode_backups_enabled', label: 'Linode backups are enabled', resourceTypes: ['linode'], defaultName: 'All Linodes must have backups enabled', defaultDescription: 'Ensures that the Linode Backup Service is enabled on every instance to protect against data loss from accidental deletion or corruption.' },
  { value: 'linode_backup_recency', label: 'Linode has a recent backup', resourceTypes: ['linode'], defaultName: 'All Linodes must have a recent successful backup', defaultDescription: 'Verifies that a successful backup has actually occurred within a configurable number of days. Checks the last_successful backup timestamp, not just whether backups are configured.' },
  { value: 'linode_disk_encryption', label: 'Linode disk encryption is enabled', resourceTypes: ['linode'], defaultName: 'Linode disk encryption must be enabled', defaultDescription: 'Checks that disk encryption is enabled for every Linode instance to protect data at rest in accordance with security best practices.' },
  { value: 'linode_lock_configured', label: 'Linode has a deletion lock configured', resourceTypes: ['linode'], defaultName: 'Critical Linodes must have a deletion lock configured', defaultDescription: 'Ensures that a deletion lock is set on Linode instances to prevent accidental or unauthorised removal of critical infrastructure.' },
  { value: 'linode_not_offline', label: 'Linode instance is not offline', resourceTypes: ['linode'], defaultName: 'Linode instances must not be offline', defaultDescription: 'Detects Linode instances that are currently in an offline state, which may indicate an incident, misconfiguration, or an idle resource that should be reviewed.' },
  { value: 'linode_plan_tier_by_tag', label: 'Linode plan tier matches tag requirement', resourceTypes: ['linode'], defaultName: 'Linodes with a specific tag must use an approved plan tier', defaultDescription: 'Ensures that Linode instances carrying a specific tag (e.g. environment:production) are running on an approved plan tier (e.g. dedicated, highmem) rather than a shared or nanode plan.' },
  { value: 'firewall_rfc1918_lateral', label: 'No RFC-1918 traffic on sensitive ports', resourceTypes: ['firewall'], defaultName: 'Firewall rules must not allow RFC-1918 traffic on sensitive ports', defaultDescription: 'Detects inbound firewall rules that accept traffic from private RFC-1918 address ranges (10.x, 172.16-31.x, 192.168.x) on sensitive ports such as SSH, RDP, databases and caches — a sign of potential lateral movement risk.' },
  { value: 'firewall_rule_descriptions', label: 'All firewall rules must have descriptions', resourceTypes: ['firewall'], defaultName: 'Every firewall rule must have a description', defaultDescription: 'Checks that all inbound and outbound firewall rules have a non-empty description set. Descriptions help document the purpose of each rule, making it easier to audit and review firewall configurations.' },
  { value: 'firewall_no_duplicate_rules', label: 'No duplicate firewall rules', resourceTypes: ['firewall'], defaultName: 'Firewall rules must not contain duplicates', defaultDescription: 'Detects inbound or outbound firewall rules that are identical in action, protocol, port range and address set. Duplicate rules create unnecessary noise, indicate copy-paste errors, and can mask the true intent of a firewall policy.' },
  { value: 'firewall_all_ports_allowed', label: 'No rules allowing all ports', resourceTypes: ['firewall'], defaultName: 'Firewall rules must not allow all ports', defaultDescription: 'Detects inbound or outbound firewall rules that allow traffic on all ports — either through a protocol of ALL, an empty port range, or the full range 1-65535. Such rules are overly permissive and should be replaced with specific port allowances.' },
  { value: 'nodebalancer_protocol_check', label: 'NodeBalancer port protocol check', resourceTypes: ['nodebalancer'], defaultName: 'NodeBalancers must only use approved protocols', defaultDescription: 'Checks every port configuration on a NodeBalancer to ensure it uses an allowed protocol (e.g. HTTPS only) and does not use any forbidden protocol (e.g. HTTP or UDP).' },
  { value: 'nodebalancer_port_allowlist', label: 'NodeBalancer allowed ports check', resourceTypes: ['nodebalancer'], defaultName: 'NodeBalancers must only expose allowed ports', defaultDescription: 'Checks every port configuration on a NodeBalancer to ensure it only listens on approved ports. Popular webapp ports (80, 443, 8080, 8443) are pre-approved; custom ports can also be specified.' },
];

const BUCKET_ACL_OPTIONS = ['private', 'public-read', 'public-read-write', 'authenticated-read', 'custom'];
const SUGGESTED_TAG_KEYS = ['owner', 'environment', 'cost-center', 'team', 'project', 'service'];
const ENVIRONMENT_VALUES = ['production', 'staging', 'development', 'testing'];

interface FirewallRulesConfig { required_inbound_policy: string; required_outbound_policy: string; blocked_ports: string; allowed_source_ips: string; require_no_open_ports: boolean; }
interface BucketAclConfig { required_acl: string; forbidden_acls: string[]; }
interface BucketCorsConfig { require_cors_disabled: boolean; require_cors_enabled: boolean; }
interface DbAllowlistConfig { forbidden_cidrs: string; require_non_empty: boolean; }
interface NbProtocolConfig { allowed_protocols: string[]; forbidden_protocols: string[]; }
interface NbPortAllowlistConfig { allowed_ports: number[]; custom_ports: string; }
interface TagRequirement { key: string; value: string; }
interface LinodeRegion { id: string; label: string; country: string; }
interface PlanTierConfig { tag: string; tag_value: string; approved_tiers: string[]; }
interface Rfc1918Config { sensitive_ports: string; }
interface AllPortsConfig { check_inbound: boolean; check_outbound: boolean; actions: string[]; }

const NB_PROTOCOLS = ['tcp', 'http', 'https', 'udp'] as const;
const NB_POPULAR_PORTS: { port: number; label: string }[] = [
  { port: 80, label: 'HTTP (80)' },
  { port: 443, label: 'HTTPS (443)' },
  { port: 8080, label: 'Alt HTTP (8080)' },
  { port: 8443, label: 'Alt HTTPS (8443)' },
  { port: 3000, label: 'Dev / Node (3000)' },
  { port: 3001, label: 'Dev alt (3001)' },
  { port: 4000, label: 'Dev (4000)' },
  { port: 5000, label: 'Dev / Flask (5000)' },
  { port: 8000, label: 'Dev / Django (8000)' },
  { port: 9000, label: 'App server (9000)' },
];

function getGroupForRule(rule: ComplianceRule): string {
  for (const group of RULE_GROUPS) {
    if (group.conditionTypes.includes(rule.condition_type)) return group.key;
  }
  return 'governance';
}

export function RuleManagerView({ accountId }: RuleManagerViewProps) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(RULE_GROUPS.map(g => g.key)));
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', severity: 'warning' });
  const [showNewRule, setShowNewRule] = useState(false);
  const [showCombineRules, setShowCombineRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [compositeForm, setCompositeForm] = useState({ name: '', description: '', severity: 'warning' });
  const [compositeConfig, setCompositeConfig] = useState<CompositeConfig>({ operator: 'AND', rule_ids: [] });
  const [combineError, setCombineError] = useState<string | null>(null);
  const [editingCompositeRuleId, setEditingCompositeRuleId] = useState<string | null>(null);
  const [activeProfileConditionTypes, setActiveProfileConditionTypes] = useState<Set<string>>(new Set());
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);

  const initialConditionType = CONDITION_TYPES.find(c => c.value === 'has_tags')!;
  const [newRule, setNewRule] = useState({ name: initialConditionType.defaultName, description: initialConditionType.defaultDescription, condition_type: 'has_tags', severity: 'warning' });
  const [fwRulesConfig, setFwRulesConfig] = useState<FirewallRulesConfig>({ required_inbound_policy: 'DROP', required_outbound_policy: '', blocked_ports: '', allowed_source_ips: '', require_no_open_ports: false });
  const [bucketAclConfig, setBucketAclConfig] = useState<BucketAclConfig>({ required_acl: '', forbidden_acls: ['public-read', 'public-read-write', 'authenticated-read'] });
  const [bucketCorsConfig, setBucketCorsConfig] = useState<BucketCorsConfig>({ require_cors_disabled: true, require_cors_enabled: false });
  const [dbAllowlistConfig, setDbAllowlistConfig] = useState<DbAllowlistConfig>({ forbidden_cidrs: '0.0.0.0/0, ::/0', require_non_empty: false });
  const [dbPublicAccessAllowed, setDbPublicAccessAllowed] = useState(false);
  const [tagRequirements, setTagRequirements] = useState<TagRequirement[]>([{ key: 'owner', value: '' }, { key: 'environment', value: '' }, { key: 'cost-center', value: '' }]);
  const [tagInput, setTagInput] = useState({ key: '', value: '' });
  const [approvedRegions, setApprovedRegions] = useState<string[]>([]);
  const [minNodeCount, setMinNodeCount] = useState(2);
  const [requiredLockTypes, setRequiredLockTypes] = useState<string[]>([]);
  const [nbProtocolConfig, setNbProtocolConfig] = useState<NbProtocolConfig>({ allowed_protocols: ['https'], forbidden_protocols: [] });
  const [nbPortAllowlistConfig, setNbPortAllowlistConfig] = useState<NbPortAllowlistConfig>({ allowed_ports: [80, 443], custom_ports: '' });
  const [allowedIPs, setAllowedIPs] = useState<string[]>([]);
  const [allowedIPInput, setAllowedIPInput] = useState('');
  const [backupMaxAgeDays, setBackupMaxAgeDays] = useState(7);
  const [planTierConfig, setPlanTierConfig] = useState<PlanTierConfig>({ tag: 'environment', tag_value: 'production', approved_tiers: ['dedicated'] });
  const [rfc1918Config, setRfc1918Config] = useState<Rfc1918Config>({ sensitive_ports: '22, 3389, 3306, 5432, 5984, 6379, 9200, 27017' });
  const [allPortsConfig, setAllPortsConfig] = useState<AllPortsConfig>({ check_inbound: true, check_outbound: false, actions: ['ACCEPT'] });
  const [regions, setRegions] = useState<LinodeRegion[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);

  const [editFwRulesConfig, setEditFwRulesConfig] = useState<FirewallRulesConfig>({ required_inbound_policy: 'DROP', required_outbound_policy: '', blocked_ports: '', allowed_source_ips: '', require_no_open_ports: false });
  const [editBucketAclConfig, setEditBucketAclConfig] = useState<BucketAclConfig>({ required_acl: '', forbidden_acls: [] });
  const [editBucketCorsConfig, setEditBucketCorsConfig] = useState<BucketCorsConfig>({ require_cors_disabled: false, require_cors_enabled: false });
  const [editDbAllowlistConfig, setEditDbAllowlistConfig] = useState<DbAllowlistConfig>({ forbidden_cidrs: '0.0.0.0/0, ::/0', require_non_empty: false });
  const [editDbPublicAccessAllowed, setEditDbPublicAccessAllowed] = useState(false);
  const [editTagRequirements, setEditTagRequirements] = useState<TagRequirement[]>([]);
  const [editTagInput, setEditTagInput] = useState({ key: '', value: '' });
  const [editApprovedRegions, setEditApprovedRegions] = useState<string[]>([]);
  const [editMinNodeCount, setEditMinNodeCount] = useState(2);
  const [editRequiredLockTypes, setEditRequiredLockTypes] = useState<string[]>([]);
  const [editNbProtocolConfig, setEditNbProtocolConfig] = useState<NbProtocolConfig>({ allowed_protocols: [], forbidden_protocols: [] });
  const [editNbPortAllowlistConfig, setEditNbPortAllowlistConfig] = useState<NbPortAllowlistConfig>({ allowed_ports: [], custom_ports: '' });
  const [editAllowedIPs, setEditAllowedIPs] = useState<string[]>([]);
  const [editAllowedIPInput, setEditAllowedIPInput] = useState('');
  const [editBackupMaxAgeDays, setEditBackupMaxAgeDays] = useState(7);
  const [editPlanTierConfig, setEditPlanTierConfig] = useState<PlanTierConfig>({ tag: 'environment', tag_value: 'production', approved_tiers: ['dedicated'] });
  const [editRfc1918Config, setEditRfc1918Config] = useState<Rfc1918Config>({ sensitive_ports: '22, 3389, 3306, 5432, 5984, 6379, 9200, 27017' });
  const [editAllPortsConfig, setEditAllPortsConfig] = useState<AllPortsConfig>({ check_inbound: true, check_outbound: false, actions: ['ACCEPT'] });

  const { isReadOnly } = useAuth();

  useEffect(() => { load(); }, [accountId]);

  useEffect(() => {
    if (newRule.condition_type === 'approved_regions' && regions.length === 0) fetchRegions();
  }, [newRule.condition_type]);

  async function load() {
    setLoading(true);
    try {
      const [data, activeProfile] = await Promise.all([
        getComplianceRules(accountId),
        getActiveProfileForAccount(accountId),
      ]);
      setRules(data as ComplianceRule[]);
      if (activeProfile?.profile) {
        const profile = activeProfile.profile as any;
        setActiveProfileConditionTypes(new Set(profile.rule_condition_types || []));
        setActiveProfileName(profile.name || null);
      } else {
        setActiveProfileConditionTypes(new Set());
        setActiveProfileName(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchRegions() {
    setRegionsLoading(true);
    try {
      const res = await fetch('https://api.linode.com/v4/regions');
      if (res.ok) {
        const data = await res.json();
        setRegions((data.data || []).sort((a: LinodeRegion, b: LinodeRegion) => a.label.localeCompare(b.label)));
      }
    } finally {
      setRegionsLoading(false);
    }
  }

  function openEditRule(rule: ComplianceRule) {
    if (rule.condition_type === 'composite') {
      const cfg = rule.condition_config || {};
      setEditingCompositeRuleId(rule.id);
      setCompositeForm({ name: rule.name, description: rule.description, severity: rule.severity });
      const operator = cfg.operator || 'AND';
      if (operator === 'IF_THEN') {
        setCompositeConfig({ operator: 'IF_THEN', rule_ids: [], if_rule_id: cfg.if_rule_id || '', then_rule_id: cfg.then_rule_id || '' });
      } else if (operator === 'NOT') {
        setCompositeConfig({ operator: 'NOT', rule_ids: cfg.rule_ids || [] });
      } else {
        setCompositeConfig({ operator, rule_ids: cfg.rule_ids || [] });
      }
      setCombineError(null);
      setShowCombineRules(true);
      return;
    }
    setEditingRule(rule);
    setEditForm({ name: rule.name, description: rule.description, severity: rule.severity });
    const cfg = rule.condition_config || {};
    if (rule.condition_type === 'firewall_rules_check') {
      setEditFwRulesConfig({ required_inbound_policy: cfg.required_inbound_policy || '', required_outbound_policy: cfg.required_outbound_policy || '', blocked_ports: (cfg.blocked_ports || []).join(', '), allowed_source_ips: (cfg.allowed_source_ips || []).join(', '), require_no_open_ports: cfg.require_no_open_ports || false });
    } else if (rule.condition_type === 'bucket_acl_check') {
      setEditBucketAclConfig({ required_acl: cfg.required_acl || '', forbidden_acls: cfg.forbidden_acls || [] });
    } else if (rule.condition_type === 'bucket_cors_check') {
      setEditBucketCorsConfig({ require_cors_disabled: cfg.require_cors_disabled || false, require_cors_enabled: cfg.require_cors_enabled || false });
    } else if (rule.condition_type === 'approved_regions') {
      setEditApprovedRegions(cfg.approved_regions || []);
      if (regions.length === 0) fetchRegions();
    } else if (rule.condition_type === 'db_allowlist_check') {
      setEditDbAllowlistConfig({ forbidden_cidrs: (cfg.forbidden_cidrs || ['0.0.0.0/0', '::/0']).join(', '), require_non_empty: cfg.require_non_empty || false });
    } else if (rule.condition_type === 'db_public_access') {
      setEditDbPublicAccessAllowed(cfg.allow_public_access || false);
    } else if (rule.condition_type === 'has_tags') {
      const reqs: TagRequirement[] = cfg.required_tags || [];
      setEditTagRequirements(reqs.length > 0 ? reqs : [{ key: 'owner', value: '' }, { key: 'environment', value: '' }, { key: 'cost-center', value: '' }]);
      setEditTagInput({ key: '', value: '' });
    } else if (rule.condition_type === 'min_node_count') {
      setEditMinNodeCount(cfg.min_count ?? 2);
    } else if (rule.condition_type === 'linode_lock_configured') {
      setEditRequiredLockTypes(cfg.required_lock_types || []);
    } else if (rule.condition_type === 'nodebalancer_protocol_check') {
      setEditNbProtocolConfig({ allowed_protocols: cfg.allowed_protocols || [], forbidden_protocols: cfg.forbidden_protocols || [] });
    } else if (rule.condition_type === 'nodebalancer_port_allowlist') {
      const knownPorts = NB_POPULAR_PORTS.map(p => p.port);
      const allAllowed: number[] = cfg.allowed_ports || [];
      const popularChecked = allAllowed.filter((p: number) => knownPorts.includes(p));
      const customOnes = allAllowed.filter((p: number) => !knownPorts.includes(p));
      setEditNbPortAllowlistConfig({ allowed_ports: popularChecked, custom_ports: customOnes.join(', ') });
    } else if (rule.condition_type === 'login_allowed_ips') {
      setEditAllowedIPs(cfg.allowed_ips || []);
      setEditAllowedIPInput('');
    } else if (rule.condition_type === 'linode_backup_recency') {
      setEditBackupMaxAgeDays(cfg.max_age_days ?? 7);
    } else if (rule.condition_type === 'linode_plan_tier_by_tag') {
      setEditPlanTierConfig({ tag: cfg.tag || 'environment', tag_value: cfg.tag_value || 'production', approved_tiers: cfg.approved_tiers || ['dedicated'] });
    } else if (rule.condition_type === 'firewall_rfc1918_lateral') {
      setEditRfc1918Config({ sensitive_ports: (cfg.sensitive_ports || [22, 3389, 3306, 5432, 5984, 6379, 9200, 27017]).join(', ') });
    } else if (rule.condition_type === 'firewall_all_ports_allowed') {
      setEditAllPortsConfig({ check_inbound: cfg.check_inbound ?? true, check_outbound: cfg.check_outbound ?? false, actions: cfg.actions || ['ACCEPT'] });
    }
  }

  function buildEditConditionConfig(): Record<string, any> {
    if (!editingRule) return {};
    const t = editingRule.condition_type;
    if (t === 'firewall_rules_check') {
      const cfg: Record<string, any> = {};
      if (editFwRulesConfig.required_inbound_policy) cfg.required_inbound_policy = editFwRulesConfig.required_inbound_policy;
      if (editFwRulesConfig.required_outbound_policy) cfg.required_outbound_policy = editFwRulesConfig.required_outbound_policy;
      if (editFwRulesConfig.blocked_ports.trim()) cfg.blocked_ports = editFwRulesConfig.blocked_ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (editFwRulesConfig.allowed_source_ips.trim()) cfg.allowed_source_ips = editFwRulesConfig.allowed_source_ips.split(',').map(s => s.trim()).filter(Boolean);
      if (editFwRulesConfig.require_no_open_ports) cfg.require_no_open_ports = true;
      return cfg;
    }
    if (t === 'bucket_acl_check') { const cfg: Record<string, any> = {}; if (editBucketAclConfig.required_acl) cfg.required_acl = editBucketAclConfig.required_acl; if (editBucketAclConfig.forbidden_acls.length > 0) cfg.forbidden_acls = editBucketAclConfig.forbidden_acls; return cfg; }
    if (t === 'bucket_cors_check') { const cfg: Record<string, any> = {}; if (editBucketCorsConfig.require_cors_disabled) cfg.require_cors_disabled = true; if (editBucketCorsConfig.require_cors_enabled) cfg.require_cors_enabled = true; return cfg; }
    if (t === 'approved_regions') return { approved_regions: editApprovedRegions };
    if (t === 'db_allowlist_check') { const cfg: Record<string, any> = {}; if (editDbAllowlistConfig.forbidden_cidrs.trim()) cfg.forbidden_cidrs = editDbAllowlistConfig.forbidden_cidrs.split(',').map(s => s.trim()).filter(Boolean); if (editDbAllowlistConfig.require_non_empty) cfg.require_non_empty = true; return cfg; }
    if (t === 'db_public_access') return { allow_public_access: editDbPublicAccessAllowed };
    if (t === 'has_tags') return { required_tags: editTagRequirements.filter(t => t.key.trim()) };
    if (t === 'min_node_count') return { min_count: editMinNodeCount };
    if (t === 'linode_lock_configured') return { required_lock_types: editRequiredLockTypes };
    if (t === 'nodebalancer_protocol_check') return { allowed_protocols: editNbProtocolConfig.allowed_protocols, forbidden_protocols: editNbProtocolConfig.forbidden_protocols };
    if (t === 'nodebalancer_port_allowlist') {
      const custom = editNbPortAllowlistConfig.custom_ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 65535);
      const combined = Array.from(new Set([...editNbPortAllowlistConfig.allowed_ports, ...custom])).sort((a, b) => a - b);
      return { allowed_ports: combined };
    }
    if (t === 'login_allowed_ips') return { allowed_ips: editAllowedIPs };
    if (t === 'linode_backup_recency') return { max_age_days: editBackupMaxAgeDays };
    if (t === 'linode_plan_tier_by_tag') return { tag: editPlanTierConfig.tag, tag_value: editPlanTierConfig.tag_value, approved_tiers: editPlanTierConfig.approved_tiers };
    if (t === 'firewall_rfc1918_lateral') { const ports = editRfc1918Config.sensitive_ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0); return ports.length > 0 ? { sensitive_ports: ports } : {}; }
    if (t === 'firewall_all_ports_allowed') return { check_inbound: editAllPortsConfig.check_inbound, check_outbound: editAllPortsConfig.check_outbound, actions: editAllPortsConfig.actions };
    return {};
  }

  function buildNewConditionConfig(): Record<string, any> {
    const t = newRule.condition_type;
    if (t === 'firewall_rules_check') {
      const cfg: Record<string, any> = {};
      if (fwRulesConfig.required_inbound_policy) cfg.required_inbound_policy = fwRulesConfig.required_inbound_policy;
      if (fwRulesConfig.required_outbound_policy) cfg.required_outbound_policy = fwRulesConfig.required_outbound_policy;
      if (fwRulesConfig.blocked_ports.trim()) cfg.blocked_ports = fwRulesConfig.blocked_ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (fwRulesConfig.allowed_source_ips.trim()) cfg.allowed_source_ips = fwRulesConfig.allowed_source_ips.split(',').map(s => s.trim()).filter(Boolean);
      if (fwRulesConfig.require_no_open_ports) cfg.require_no_open_ports = true;
      return cfg;
    }
    if (t === 'bucket_acl_check') { const cfg: Record<string, any> = {}; if (bucketAclConfig.required_acl) cfg.required_acl = bucketAclConfig.required_acl; if (bucketAclConfig.forbidden_acls.length > 0) cfg.forbidden_acls = bucketAclConfig.forbidden_acls; return cfg; }
    if (t === 'bucket_cors_check') { const cfg: Record<string, any> = {}; if (bucketCorsConfig.require_cors_disabled) cfg.require_cors_disabled = true; if (bucketCorsConfig.require_cors_enabled) cfg.require_cors_enabled = true; return cfg; }
    if (t === 'approved_regions') return { approved_regions: approvedRegions };
    if (t === 'db_allowlist_check') { const cfg: Record<string, any> = {}; if (dbAllowlistConfig.forbidden_cidrs.trim()) cfg.forbidden_cidrs = dbAllowlistConfig.forbidden_cidrs.split(',').map(s => s.trim()).filter(Boolean); if (dbAllowlistConfig.require_non_empty) cfg.require_non_empty = true; return cfg; }
    if (t === 'db_public_access') return { allow_public_access: dbPublicAccessAllowed };
    if (t === 'has_tags') return { required_tags: tagRequirements.filter(r => r.key.trim()) };
    if (t === 'min_node_count') return { min_count: minNodeCount };
    if (t === 'linode_lock_configured') return { required_lock_types: requiredLockTypes };
    if (t === 'nodebalancer_protocol_check') return { allowed_protocols: nbProtocolConfig.allowed_protocols, forbidden_protocols: nbProtocolConfig.forbidden_protocols };
    if (t === 'nodebalancer_port_allowlist') {
      const custom = nbPortAllowlistConfig.custom_ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 65535);
      const combined = Array.from(new Set([...nbPortAllowlistConfig.allowed_ports, ...custom])).sort((a, b) => a - b);
      return { allowed_ports: combined };
    }
    if (t === 'login_allowed_ips') return { allowed_ips: allowedIPs };
    if (t === 'linode_backup_recency') return { max_age_days: backupMaxAgeDays };
    if (t === 'linode_plan_tier_by_tag') return { tag: planTierConfig.tag, tag_value: planTierConfig.tag_value, approved_tiers: planTierConfig.approved_tiers };
    if (t === 'firewall_rfc1918_lateral') { const ports = rfc1918Config.sensitive_ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0); return ports.length > 0 ? { sensitive_ports: ports } : {}; }
    if (t === 'firewall_all_ports_allowed') return { check_inbound: allPortsConfig.check_inbound, check_outbound: allPortsConfig.check_outbound, actions: allPortsConfig.actions };
    return {};
  }

  async function handleSaveEdit() {
    if (!editingRule || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const conditionConfig = buildEditConditionConfig();
      await updateComplianceRule(editingRule.id, { name: editForm.name, description: editForm.description, severity: editForm.severity, condition_config: conditionConfig });
      setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...editForm, condition_config: conditionConfig } : r));
      setEditingRule(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRule() {
    if (!newRule.name.trim()) return;
    setSaving(true);
    try {
      const condDef = CONDITION_TYPES.find(c => c.value === newRule.condition_type);
      const created = await createComplianceRule({
        name: newRule.name,
        description: newRule.description,
        resource_types: condDef?.resourceTypes || [],
        condition_type: newRule.condition_type,
        condition_config: buildNewConditionConfig(),
        severity: newRule.severity,
        account_id: accountId,
      });
      setRules(prev => [...prev, created as ComplianceRule]);
      setShowNewRule(false);
      const defaultCt = CONDITION_TYPES.find(c => c.value === 'has_tags')!;
      setNewRule({ name: defaultCt.defaultName, description: defaultCt.defaultDescription, condition_type: 'has_tags', severity: 'warning' });
      setTagRequirements([{ key: 'owner', value: '' }, { key: 'environment', value: '' }, { key: 'cost-center', value: '' }]);
      setApprovedRegions([]);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rule: ComplianceRule) {
    await deleteComplianceRule(rule.id);
    setRules(prev => prev.filter(r => r.id !== rule.id));
  }

  function closeCompositeModal() {
    setShowCombineRules(false);
    setEditingCompositeRuleId(null);
    setCombineError(null);
    setCompositeForm({ name: '', description: '', severity: 'warning' });
    setCompositeConfig({ operator: 'AND', rule_ids: [] });
  }

  async function handleSaveComposite() {
    const err = validateCompositeConfig(compositeConfig);
    if (err) { setCombineError(err); return; }
    if (!compositeForm.name.trim()) { setCombineError('Name is required.'); return; }
    setCombineError(null);
    setSaving(true);
    try {
      if (editingCompositeRuleId) {
        await updateComplianceRule(editingCompositeRuleId, {
          name: compositeForm.name,
          description: compositeForm.description,
          severity: compositeForm.severity,
          condition_config: compositeConfig,
        });
        setRules(prev => prev.map(r =>
          r.id === editingCompositeRuleId
            ? { ...r, name: compositeForm.name, description: compositeForm.description, severity: compositeForm.severity as any, condition_config: compositeConfig }
            : r
        ));
      } else {
        const created = await createComplianceRule({
          name: compositeForm.name,
          description: compositeForm.description,
          resource_types: [],
          condition_type: 'composite',
          condition_config: compositeConfig,
          severity: compositeForm.severity,
          account_id: accountId,
        });
        setRules(prev => [...prev, created as ComplianceRule]);
      }
      closeCompositeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: ComplianceRule) {
    if (togglingRuleId === rule.id) return;
    setTogglingRuleId(rule.id);
    try {
      const newState = !rule.is_active;
      await toggleRuleForAccount(accountId, rule.id, newState);
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: newState } : r));
    } finally {
      setTogglingRuleId(null);
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const builtinCount = rules.filter(r => r.is_builtin).length;
  const customCount = rules.filter(r => !r.is_builtin).length;
  const activeCount = rules.filter(r => r.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Rule Manager</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage compliance rules for this account. Built-in rules apply globally; custom rules are scoped to this account.
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowCombineRules(true); setCombineError(null); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors shadow-sm"
            >
              <GitMerge size={14} /> Combine Rules
            </button>
            <button
              onClick={() => setShowNewRule(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={15} /> New Rule
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Rules', value: rules.length, color: 'text-gray-800 dark:text-gray-100', sub: `${activeCount} active` },
          { label: 'Built-in', value: builtinCount, color: 'text-gray-600 dark:text-gray-300', sub: `${rules.filter(r => r.is_builtin && r.is_active).length} active` },
          { label: 'Custom', value: customCount, color: 'text-blue-600 dark:text-blue-400', sub: `${rules.filter(r => !r.is_builtin && r.is_active).length} active` },
          { label: 'Disabled', value: rules.filter(r => !r.is_active).length, color: 'text-gray-400 dark:text-gray-500', sub: 'excluded from evaluation' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {RULE_GROUPS.map(group => {
          const groupRules = rules.filter(r => getGroupForRule(r) === group.key);
          if (groupRules.length === 0) return null;
          const isExpanded = expandedGroups.has(group.key);
          const GroupIcon = group.icon;
          const activeInGroup = groupRules.filter(r => r.is_active).length;

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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{group.label}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{groupRules.length} rule{groupRules.length !== 1 ? 's' : ''}</span>
                    <span className="text-[11px] text-green-600 dark:text-green-400">{activeInGroup} active</span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {groupRules.map(rule => {
                    const sev = severityConfig[rule.severity as keyof typeof severityConfig] || severityConfig.info;
                    return (
                      <div key={rule.id} className={`flex items-start gap-4 px-5 py-4 transition-opacity ${!rule.is_active ? 'opacity-50' : ''}`}>
                        {isReadOnly ? (
                          <div className="mt-0.5 flex-shrink-0 cursor-not-allowed">
                            {rule.is_active
                              ? <ToggleRight size={32} className="text-blue-400 dark:text-blue-500 opacity-50" />
                              : <ToggleLeft size={32} className="text-gray-300 dark:text-gray-600 opacity-50" />}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleToggle(rule)}
                            title={rule.is_active ? 'Disable rule' : 'Enable rule'}
                            disabled={togglingRuleId === rule.id}
                            className="mt-0.5 flex-shrink-0 group/toggle disabled:cursor-wait"
                          >
                            {togglingRuleId === rule.id
                              ? <Loader2 size={32} className="animate-spin text-gray-400" />
                              : rule.is_active
                                ? <ToggleRight size={32} className="text-blue-500 dark:text-blue-400 group-hover/toggle:text-blue-600 dark:group-hover/toggle:text-blue-300 transition-colors" />
                                : <ToggleLeft size={32} className="text-gray-300 dark:text-gray-600 group-hover/toggle:text-gray-400 dark:group-hover/toggle:text-gray-500 transition-colors" />}
                          </button>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{rule.name}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${sev.classes}`}>{sev.label}</span>
                            {rule.condition_type === 'composite' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono">
                                <GitMerge size={8} /> {rule.condition_config?.operator ?? 'composite'}
                              </span>
                            )}
                            {rule.is_builtin ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                                <Lock size={8} /> Built-in
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700">
                                <Plus size={8} /> Custom
                              </span>
                            )}
                            {!rule.is_active && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700">
                                <ShieldOff size={8} /> Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rule.description}</p>
                          {rule.condition_type === 'composite' && (() => {
                            const cfg = rule.condition_config || {};
                            const op: string = cfg.operator || 'AND';
                            const subIds: string[] = op === 'IF_THEN'
                              ? [cfg.if_rule_id, cfg.then_rule_id].filter(Boolean)
                              : (cfg.rule_ids || []);
                            const subNames = subIds.map((id: string) => rules.find(r => r.id === id)?.name ?? id);
                            if (subNames.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                {subNames.map((name: string, i: number) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-700">
                                    {i > 0 && op !== 'IF_THEN' && <span className="text-slate-400 font-bold mr-0.5">{op}</span>}
                                    {op === 'IF_THEN' && i === 0 && <span className="text-amber-500 font-bold mr-0.5">IF</span>}
                                    {op === 'IF_THEN' && i === 1 && <span className="text-blue-500 font-bold mr-0.5">THEN</span>}
                                    {name}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
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

                        {!isReadOnly && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => openEditRule(rule)}
                              title="Edit rule"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            {(() => {
                              const isProfileProtected = activeProfileConditionTypes.has(rule.condition_type);
                              const deleteTitle = isProfileProtected
                                ? `This rule is part of the active profile "${activeProfileName}" and cannot be deleted while the profile is active`
                                : 'Delete rule';
                              return (
                                <button
                                  onClick={() => !isProfileProtected && handleDelete(rule)}
                                  title={deleteTitle}
                                  disabled={isProfileProtected}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    isProfileProtected
                                      ? 'text-gray-200 dark:text-gray-700 cursor-not-allowed'
                                      : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer'
                                  }`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {rules.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <BookOpen size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No rules yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Create a rule to start evaluating your account's resources.</p>
          </div>
        )}
      </div>

      {showCombineRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
                  <GitMerge size={16} className="text-slate-500" /> {editingCompositeRuleId ? 'Edit Composite Rule' : 'Combine Rules'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {editingCompositeRuleId ? 'Update the operator, sub-rules, and details of this composite rule.' : 'Create a new composite rule by combining existing standalone rules with logical operators.'}
                </p>
              </div>
              <button
                onClick={closeCompositeModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <CompositeRuleBuilder
                availableRules={rules.filter(r => r.condition_type !== 'composite')}
                value={compositeConfig}
                onChange={cfg => { setCompositeConfig(cfg); setCombineError(null); }}
                onConfigureRule={rule => openEditRule(rule)}
              />

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Rule details</p>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
                  <input
                    type="text"
                    value={compositeForm.name}
                    onChange={e => setCompositeForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Production Linode must have backups AND firewall"
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Description</label>
                  <textarea
                    rows={2}
                    value={compositeForm.description}
                    onChange={e => setCompositeForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="What does this combined rule check?"
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Severity</label>
                  <select
                    value={compositeForm.severity}
                    onChange={e => setCompositeForm(p => ({ ...p, severity: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>

              {combineError && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  {combineError}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-6 pt-0">
              <button
                onClick={closeCompositeModal}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveComposite}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {editingCompositeRuleId ? 'Save Changes' : 'Create Composite Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRule && (
        <div className={`fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 ${showCombineRules ? 'z-60' : 'z-50'}`}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-50">Edit Rule</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{editingRule.condition_type.replace(/_/g, ' ')}</p>
              </div>
              <button onClick={() => setEditingRule(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Description</label>
                <textarea rows={2} value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Severity</label>
                <select value={editForm.severity} onChange={e => setEditForm(p => ({ ...p, severity: e.target.value }))} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>

              <EditConditionConfig
                rule={editingRule}
                fwConfig={editFwRulesConfig} setFwConfig={setEditFwRulesConfig}
                bucketAclConfig={editBucketAclConfig} setBucketAclConfig={setEditBucketAclConfig}
                bucketCorsConfig={editBucketCorsConfig} setBucketCorsConfig={setEditBucketCorsConfig}
                dbAllowlistConfig={editDbAllowlistConfig} setDbAllowlistConfig={setEditDbAllowlistConfig}
                dbPublicAccessAllowed={editDbPublicAccessAllowed} setDbPublicAccessAllowed={setEditDbPublicAccessAllowed}
                tagRequirements={editTagRequirements} setTagRequirements={setEditTagRequirements}
                tagInput={editTagInput} setTagInput={setEditTagInput}
                approvedRegions={editApprovedRegions} setApprovedRegions={setEditApprovedRegions}
                minNodeCount={editMinNodeCount} setMinNodeCount={setEditMinNodeCount}
                requiredLockTypes={editRequiredLockTypes} setRequiredLockTypes={setEditRequiredLockTypes}
                nbProtocolConfig={editNbProtocolConfig} setNbProtocolConfig={setEditNbProtocolConfig}
                nbPortAllowlistConfig={editNbPortAllowlistConfig} setNbPortAllowlistConfig={setEditNbPortAllowlistConfig}
                allowedIPs={editAllowedIPs} setAllowedIPs={setEditAllowedIPs}
                allowedIPInput={editAllowedIPInput} setAllowedIPInput={setEditAllowedIPInput}
                backupMaxAgeDays={editBackupMaxAgeDays} setBackupMaxAgeDays={setEditBackupMaxAgeDays}
                planTierConfig={editPlanTierConfig} setPlanTierConfig={setEditPlanTierConfig}
                rfc1918Config={editRfc1918Config} setRfc1918Config={setEditRfc1918Config}
                allPortsConfig={editAllPortsConfig} setAllPortsConfig={setEditAllPortsConfig}
                regions={regions} regionsLoading={regionsLoading}
              />
            </div>
            <div className="flex items-center gap-2 p-6 pt-0">
              <button onClick={() => setEditingRule(null)} className="flex-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={handleSaveEdit} disabled={!editForm.name.trim() || saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {saving && <Loader2 size={13} className="animate-spin" />} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-50">New Rule</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This rule will be scoped to this account only.</p>
              </div>
              <button onClick={() => { setShowNewRule(false); const dct = CONDITION_TYPES.find(c => c.value === 'has_tags')!; setNewRule({ name: dct.defaultName, description: dct.defaultDescription, condition_type: 'has_tags', severity: 'warning' }); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
                <input type="text" value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Production databases must not be public" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Description</label>
                <textarea rows={2} value={newRule.description} onChange={e => setNewRule(p => ({ ...p, description: e.target.value }))} placeholder="What does this rule check?" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Rule Type</label>
                <select value={newRule.condition_type} onChange={e => {
                  const ct = CONDITION_TYPES.find(c => c.value === e.target.value);
                  setNewRule(p => ({
                    ...p,
                    condition_type: e.target.value,
                    name: ct?.defaultName ?? p.name,
                    description: ct?.defaultDescription ?? p.description,
                  }));
                }} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {RULE_GROUPS.map(group => (
                    <optgroup key={group.key} label={group.label}>
                      {CONDITION_TYPES.filter(ct => group.conditionTypes.includes(ct.value)).map(ct => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <NewRuleConditionConfig
                conditionType={newRule.condition_type}
                fwConfig={fwRulesConfig} setFwConfig={setFwRulesConfig}
                bucketAclConfig={bucketAclConfig} setBucketAclConfig={setBucketAclConfig}
                bucketCorsConfig={bucketCorsConfig} setBucketCorsConfig={setBucketCorsConfig}
                dbAllowlistConfig={dbAllowlistConfig} setDbAllowlistConfig={setDbAllowlistConfig}
                dbPublicAccessAllowed={dbPublicAccessAllowed} setDbPublicAccessAllowed={setDbPublicAccessAllowed}
                tagRequirements={tagRequirements} setTagRequirements={setTagRequirements}
                tagInput={tagInput} setTagInput={setTagInput}
                approvedRegions={approvedRegions} setApprovedRegions={setApprovedRegions}
                minNodeCount={minNodeCount} setMinNodeCount={setMinNodeCount}
                requiredLockTypes={requiredLockTypes} setRequiredLockTypes={setRequiredLockTypes}
                nbProtocolConfig={nbProtocolConfig} setNbProtocolConfig={setNbProtocolConfig}
                nbPortAllowlistConfig={nbPortAllowlistConfig} setNbPortAllowlistConfig={setNbPortAllowlistConfig}
                allowedIPs={allowedIPs} setAllowedIPs={setAllowedIPs}
                allowedIPInput={allowedIPInput} setAllowedIPInput={setAllowedIPInput}
                backupMaxAgeDays={backupMaxAgeDays} setBackupMaxAgeDays={setBackupMaxAgeDays}
                planTierConfig={planTierConfig} setPlanTierConfig={setPlanTierConfig}
                rfc1918Config={rfc1918Config} setRfc1918Config={setRfc1918Config}
                allPortsConfig={allPortsConfig} setAllPortsConfig={setAllPortsConfig}
                regions={regions} regionsLoading={regionsLoading}
              />

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Severity</label>
                <select value={newRule.severity} onChange={e => setNewRule(p => ({ ...p, severity: e.target.value }))} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 p-6 pt-0">
              <button onClick={() => setShowNewRule(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={handleCreateRule} disabled={!newRule.name.trim() || saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {saving && <Loader2 size={13} className="animate-spin" />} Create Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConditionConfigProps {
  fwConfig: FirewallRulesConfig; setFwConfig: (v: FirewallRulesConfig) => void;
  bucketAclConfig: BucketAclConfig; setBucketAclConfig: (v: BucketAclConfig) => void;
  bucketCorsConfig: BucketCorsConfig; setBucketCorsConfig: (v: BucketCorsConfig) => void;
  dbAllowlistConfig: DbAllowlistConfig; setDbAllowlistConfig: (v: DbAllowlistConfig) => void;
  dbPublicAccessAllowed: boolean; setDbPublicAccessAllowed: (v: boolean) => void;
  tagRequirements: TagRequirement[]; setTagRequirements: (v: TagRequirement[]) => void;
  tagInput: { key: string; value: string }; setTagInput: (v: { key: string; value: string }) => void;
  approvedRegions: string[]; setApprovedRegions: (v: string[]) => void;
  minNodeCount: number; setMinNodeCount: (v: number) => void;
  requiredLockTypes: string[]; setRequiredLockTypes: (v: string[]) => void;
  nbProtocolConfig: NbProtocolConfig; setNbProtocolConfig: (v: NbProtocolConfig) => void;
  nbPortAllowlistConfig: NbPortAllowlistConfig; setNbPortAllowlistConfig: (v: NbPortAllowlistConfig) => void;
  allowedIPs: string[]; setAllowedIPs: (v: string[]) => void;
  allowedIPInput: string; setAllowedIPInput: (v: string) => void;
  backupMaxAgeDays: number; setBackupMaxAgeDays: (v: number) => void;
  planTierConfig: PlanTierConfig; setPlanTierConfig: (v: PlanTierConfig) => void;
  rfc1918Config: Rfc1918Config; setRfc1918Config: (v: Rfc1918Config) => void;
  allPortsConfig: AllPortsConfig; setAllPortsConfig: (v: AllPortsConfig) => void;
  regions: LinodeRegion[]; regionsLoading: boolean;
}

function EditConditionConfig({ rule, ...props }: ConditionConfigProps & { rule: ComplianceRule }) {
  return <ConditionConfigForm conditionType={rule.condition_type} {...props} />;
}

function NewRuleConditionConfig({ conditionType, ...props }: ConditionConfigProps & { conditionType: string }) {
  return <ConditionConfigForm conditionType={conditionType} {...props} />;
}

function ConditionConfigForm({ conditionType, fwConfig, setFwConfig, bucketAclConfig, setBucketAclConfig, bucketCorsConfig, setBucketCorsConfig, dbAllowlistConfig, setDbAllowlistConfig, dbPublicAccessAllowed, setDbPublicAccessAllowed, tagRequirements, setTagRequirements, tagInput, setTagInput, approvedRegions, setApprovedRegions, minNodeCount, setMinNodeCount, requiredLockTypes, setRequiredLockTypes, nbProtocolConfig, setNbProtocolConfig, nbPortAllowlistConfig, setNbPortAllowlistConfig, allowedIPs, setAllowedIPs, allowedIPInput, setAllowedIPInput, backupMaxAgeDays, setBackupMaxAgeDays, planTierConfig, setPlanTierConfig, rfc1918Config, setRfc1918Config, allPortsConfig, setAllPortsConfig, regions, regionsLoading }: ConditionConfigProps & { conditionType: string }) {
  if (conditionType === 'firewall_rules_check') {
    return (
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Firewall Rules Config</p>
        <div className="grid grid-cols-2 gap-2">
          {[['Inbound policy', 'required_inbound_policy'], ['Outbound policy', 'required_outbound_policy']].map(([label, key]) => (
            <div key={key}>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">{label}</label>
              <select value={(fwConfig as any)[key]} onChange={e => setFwConfig({ ...fwConfig, [key]: e.target.value })} className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Any</option>
                <option value="DROP">DROP</option>
                <option value="ACCEPT">ACCEPT</option>
              </select>
            </div>
          ))}
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400">Blocked ports (comma-separated)</label>
          <input type="text" value={fwConfig.blocked_ports} onChange={e => setFwConfig({ ...fwConfig, blocked_ports: e.target.value })} placeholder="e.g. 22, 3389" className="mt-0.5 w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400">Allowed source IPs (comma-separated)</label>
          <input type="text" value={fwConfig.allowed_source_ips} onChange={e => setFwConfig({ ...fwConfig, allowed_source_ips: e.target.value })} placeholder="e.g. 10.0.0.0/8, 192.168.1.0/24" className="mt-0.5 w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={fwConfig.require_no_open_ports} onChange={e => setFwConfig({ ...fwConfig, require_no_open_ports: e.target.checked })} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300">Require no open ports at all</span>
        </label>
      </div>
    );
  }

  if (conditionType === 'bucket_acl_check') {
    return (
      <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">Bucket ACL Config</p>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400">Required ACL (leave empty to only check forbidden)</label>
          <select value={bucketAclConfig.required_acl} onChange={e => setBucketAclConfig({ ...bucketAclConfig, required_acl: e.target.value })} className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500">
            <option value="">— none —</option>
            {BUCKET_ACL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400">Forbidden ACLs</label>
          <div className="mt-1 flex flex-wrap gap-1">
            {BUCKET_ACL_OPTIONS.slice(0, 4).map(acl => (
              <label key={acl} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={bucketAclConfig.forbidden_acls.includes(acl)} onChange={e => setBucketAclConfig({ ...bucketAclConfig, forbidden_acls: e.target.checked ? [...bucketAclConfig.forbidden_acls, acl] : bucketAclConfig.forbidden_acls.filter(a => a !== acl) })} className="w-3 h-3 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                <span className="text-[11px] text-gray-700 dark:text-gray-300 font-mono">{acl}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (conditionType === 'bucket_cors_check') {
    return (
      <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">CORS Config</p>
        {[['require_cors_disabled', 'Require CORS disabled'], ['require_cors_enabled', 'Require CORS enabled']].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={(bucketCorsConfig as any)[key]} onChange={e => setBucketCorsConfig({ ...bucketCorsConfig, [key]: e.target.checked })} className="w-3.5 h-3.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
            <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (conditionType === 'min_node_count') {
    return (
      <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Minimum Node Count</p>
        <div className="flex items-center gap-3">
          <input type="number" min={1} max={100} value={minNodeCount} onChange={e => setMinNodeCount(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">minimum nodes required</span>
        </div>
      </div>
    );
  }

  if (conditionType === 'has_tags') {
    return (
      <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">Required Tags</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Format: <code className="font-mono bg-teal-100 dark:bg-teal-800 px-0.5 rounded">key:value</code> — leave value blank or use <code className="font-mono bg-teal-100 dark:bg-teal-800 px-0.5 rounded">*</code> to accept any.</p>
        <div className="space-y-1.5">
          {tagRequirements.map((req, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 grid grid-cols-2 gap-1.5">
                <input type="text" value={req.key} onChange={e => setTagRequirements(tagRequirements.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))} placeholder="Key" list="tagKeySuggestions" className="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                <input type="text" value={req.value} onChange={e => setTagRequirements(tagRequirements.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))} placeholder="Value or *" list={req.key === 'environment' ? 'envValueSuggestions' : undefined} className="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
              <button onClick={() => setTagRequirements(tagRequirements.filter((_, idx) => idx !== i))} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><X size={12} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={tagInput.key} onChange={e => setTagInput({ ...tagInput, key: e.target.value })} placeholder="Key" list="tagKeySuggestions" className="flex-1 px-2.5 py-1.5 text-xs border border-dashed border-teal-300 dark:border-teal-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          <input type="text" value={tagInput.value} onChange={e => setTagInput({ ...tagInput, value: e.target.value })} placeholder="Value or *" className="flex-1 px-2.5 py-1.5 text-xs border border-dashed border-teal-300 dark:border-teal-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          <button onClick={() => { if (tagInput.key.trim()) { setTagRequirements([...tagRequirements, { key: tagInput.key.trim(), value: tagInput.value.trim() }]); setTagInput({ key: '', value: '' }); } }} className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-700 transition-colors"><Plus size={12} /></button>
        </div>
        <datalist id="tagKeySuggestions">{SUGGESTED_TAG_KEYS.map(k => <option key={k} value={k} />)}</datalist>
        <datalist id="envValueSuggestions">{ENVIRONMENT_VALUES.map(v => <option key={v} value={v} />)}</datalist>
      </div>
    );
  }

  if (conditionType === 'approved_regions') {
    return (
      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-green-700 dark:text-green-300">Approved Regions</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Resources must be in one of the selected regions.</p>
        {regionsLoading ? (
          <div className="flex items-center gap-2 py-2"><Loader2 size={14} className="animate-spin text-gray-400" /><span className="text-xs text-gray-400">Loading…</span></div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {regions.map(region => (
              <label key={region.id} className="flex items-center gap-2 cursor-pointer select-none py-0.5">
                <input type="checkbox" checked={approvedRegions.includes(region.id)} onChange={e => setApprovedRegions(e.target.checked ? [...approvedRegions, region.id] : approvedRegions.filter(r => r !== region.id))} className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300">{region.label} <span className="text-[10px] text-gray-400 font-mono ml-1">{region.id}</span></span>
              </label>
            ))}
          </div>
        )}
        {approvedRegions.length > 0 && <p className="text-[11px] text-green-700 dark:text-green-400 font-medium">{approvedRegions.length} region{approvedRegions.length !== 1 ? 's' : ''} selected</p>}
      </div>
    );
  }

  if (conditionType === 'db_allowlist_check') {
    return (
      <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">IP Allow List Config</p>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400">Forbidden CIDRs (comma-separated)</label>
          <input type="text" value={dbAllowlistConfig.forbidden_cidrs} onChange={e => setDbAllowlistConfig({ ...dbAllowlistConfig, forbidden_cidrs: e.target.value })} placeholder="0.0.0.0/0, ::/0" className="mt-0.5 w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={dbAllowlistConfig.require_non_empty} onChange={e => setDbAllowlistConfig({ ...dbAllowlistConfig, require_non_empty: e.target.checked })} className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300">Flag databases with an empty allow list</span>
        </label>
      </div>
    );
  }

  if (conditionType === 'db_public_access') {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">Public Access Config</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Flags databases with <code className="font-mono text-[10px] bg-gray-100 dark:bg-gray-700 px-0.5 rounded">public_access: true</code> as non-compliant by default.</p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={dbPublicAccessAllowed} onChange={e => setDbPublicAccessAllowed(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300">Allow public access (mark compliant when enabled)</span>
        </label>
      </div>
    );
  }

  if (conditionType === 'linode_lock_configured') {
    const LOCK_OPTIONS = [
      { value: 'cannot_delete', label: 'cannot_delete', description: 'Prevents the Linode from being deleted. Sub-resources can still be deleted independently.' },
      { value: 'cannot_delete_with_subresources', label: 'cannot_delete_with_subresources', description: 'Prevents the Linode and its sub-resources (e.g. config profile interfaces) from being deleted.' },
    ];
    return (
      <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Lock Configuration</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Leave all unchecked to require any lock. Select specific types to require those exact lock types.
        </p>
        <div className="space-y-2">
          {LOCK_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requiredLockTypes.includes(opt.value)}
                onChange={e => setRequiredLockTypes(e.target.checked ? [...requiredLockTypes, opt.value] : requiredLockTypes.filter(l => l !== opt.value))}
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-rose-600 focus:ring-rose-500 flex-shrink-0"
              />
              <div>
                <p className="text-xs font-mono font-medium text-gray-800 dark:text-gray-100">{opt.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (conditionType === 'nodebalancer_protocol_check') {
    return (
      <div className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-3 space-y-4">
        <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">Protocol Check Config</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Each port configuration on the NodeBalancer will be evaluated against these rules. Leave both sections empty to flag nothing.
        </p>
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">Allowed protocols <span className="font-normal text-gray-400">(only these are permitted — leave empty to skip this check)</span></p>
          <div className="flex flex-wrap gap-2">
            {NB_PROTOCOLS.map(proto => (
              <label key={proto} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={nbProtocolConfig.allowed_protocols.includes(proto)}
                  onChange={e => setNbProtocolConfig({
                    ...nbProtocolConfig,
                    allowed_protocols: e.target.checked
                      ? [...nbProtocolConfig.allowed_protocols, proto]
                      : nbProtocolConfig.allowed_protocols.filter(p => p !== proto),
                    forbidden_protocols: nbProtocolConfig.forbidden_protocols.filter(p => p !== proto),
                  })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300 uppercase">{proto}</span>
              </label>
            ))}
          </div>
          {nbProtocolConfig.allowed_protocols.length > 0 && (
            <p className="text-[11px] text-cyan-700 dark:text-cyan-400 mt-1.5 font-medium">
              Only {nbProtocolConfig.allowed_protocols.map(p => p.toUpperCase()).join(', ')} permitted
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">Forbidden protocols <span className="font-normal text-gray-400">(these are never allowed — leave empty to skip this check)</span></p>
          <div className="flex flex-wrap gap-2">
            {NB_PROTOCOLS.map(proto => (
              <label key={proto} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={nbProtocolConfig.forbidden_protocols.includes(proto)}
                  onChange={e => setNbProtocolConfig({
                    ...nbProtocolConfig,
                    forbidden_protocols: e.target.checked
                      ? [...nbProtocolConfig.forbidden_protocols, proto]
                      : nbProtocolConfig.forbidden_protocols.filter(p => p !== proto),
                    allowed_protocols: nbProtocolConfig.allowed_protocols.filter(p => p !== proto),
                  })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300 uppercase">{proto}</span>
              </label>
            ))}
          </div>
          {nbProtocolConfig.forbidden_protocols.length > 0 && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5 font-medium">
              {nbProtocolConfig.forbidden_protocols.map(p => p.toUpperCase()).join(', ')} forbidden
            </p>
          )}
        </div>
      </div>
    );
  }

  if (conditionType === 'nodebalancer_port_allowlist') {
    const effectiveCustom = nbPortAllowlistConfig.custom_ports
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0 && n <= 65535);
    const allAllowed = Array.from(new Set([...nbPortAllowlistConfig.allowed_ports, ...effectiveCustom])).sort((a, b) => a - b);

    return (
      <div className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-3 space-y-4">
        <div>
          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">Port Allowlist Config</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Only ports in the allowlist will be permitted. NodeBalancer configurations using any other port will be flagged.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-2">Popular webapp ports</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {NB_POPULAR_PORTS.map(({ port, label }) => (
              <label key={port} className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={nbPortAllowlistConfig.allowed_ports.includes(port)}
                  onChange={e => setNbPortAllowlistConfig({
                    ...nbPortAllowlistConfig,
                    allowed_ports: e.target.checked
                      ? [...nbPortAllowlistConfig.allowed_ports, port]
                      : nbPortAllowlistConfig.allowed_ports.filter(p => p !== port),
                  })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-cyan-700 dark:group-hover:text-cyan-300 transition-colors">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Custom ports <span className="font-normal text-gray-400">(comma-separated, 1–65535)</span></p>
          <input
            type="text"
            value={nbPortAllowlistConfig.custom_ports}
            onChange={e => setNbPortAllowlistConfig({ ...nbPortAllowlistConfig, custom_ports: e.target.value })}
            placeholder="e.g. 2368, 7000, 9200"
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        {allAllowed.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {allAllowed.map(p => (
              <span key={p} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700">
                :{p}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">No ports selected — all ports will be flagged.</p>
        )}
      </div>
    );
  }

  if (conditionType === 'login_allowed_ips') {
    function addIP() {
      const ip = allowedIPInput.trim();
      if (ip && !allowedIPs.includes(ip)) {
        setAllowedIPs([...allowedIPs, ip]);
      }
      setAllowedIPInput('');
    }
    return (
      <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Allowed IP Addresses</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Logins from IPs not in this list will be flagged as non-compliant. Enter individual IPs (e.g. <code className="font-mono bg-orange-100 dark:bg-orange-800 px-0.5 rounded">192.0.2.1</code>).</p>
        {allowedIPs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allowedIPs.map(ip => (
              <span key={ip} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-orange-100 dark:bg-orange-800/60 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-700">
                {ip}
                <button onClick={() => setAllowedIPs(allowedIPs.filter(i => i !== ip))} className="text-orange-400 hover:text-red-500 transition-colors ml-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={allowedIPInput}
            onChange={e => setAllowedIPInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIP(); } }}
            placeholder="e.g. 192.0.2.1"
            className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-dashed border-orange-300 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={addIP}
            className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-700 transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
        {allowedIPs.length > 0 && (
          <p className="text-[11px] text-orange-700 dark:text-orange-400 font-medium">{allowedIPs.length} IP{allowedIPs.length !== 1 ? 's' : ''} in allow list</p>
        )}
      </div>
    );
  }

  if (conditionType === 'linode_backup_recency') {
    return (
      <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Backup Recency Config</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Checks the <code className="font-mono bg-rose-100 dark:bg-rose-800 px-0.5 rounded text-[10px]">last_successful</code> backup timestamp from the Linode API — not just whether backups are enabled. Linodes with no successful backup within the window will be flagged.
        </p>
        <div className="flex items-center gap-3">
          <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Maximum backup age</label>
          <input
            type="number"
            min={1}
            max={365}
            value={backupMaxAgeDays}
            onChange={e => setBackupMaxAgeDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1)))}
            className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <span className="text-[11px] text-gray-500 dark:text-gray-400">days</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 3, 7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setBackupMaxAgeDays(d)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                backupMaxAgeDays === d
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-rose-400 dark:hover:border-rose-600 hover:text-rose-600 dark:hover:text-rose-400'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <p className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
          A successful backup must exist within the last {backupMaxAgeDays} day{backupMaxAgeDays !== 1 ? 's' : ''}.
        </p>
      </div>
    );
  }

  if (conditionType === 'firewall_rfc1918_lateral') {
    const DEFAULT_PORTS = '22, 3389, 3306, 5432, 5984, 6379, 9200, 27017';
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">Lateral Movement Detection</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Flags inbound ACCEPT rules that source traffic from RFC-1918 private ranges (<code className="font-mono bg-red-100 dark:bg-red-800 px-0.5 rounded text-[10px]">10.x</code>, <code className="font-mono bg-red-100 dark:bg-red-800 px-0.5 rounded text-[10px]">172.16-31.x</code>, <code className="font-mono bg-red-100 dark:bg-red-800 px-0.5 rounded text-[10px]">192.168.x</code>) on sensitive ports.
        </p>
        <div>
          <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
            Sensitive ports <span className="font-normal text-gray-400">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={rfc1918Config.sensitive_ports}
            onChange={e => setRfc1918Config({ sensitive_ports: e.target.value })}
            placeholder={DEFAULT_PORTS}
            className="mt-0.5 w-full px-2.5 py-1.5 text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            Default: SSH (22), RDP (3389), MySQL (3306), Postgres (5432), CouchDB (5984), Redis (6379), Elasticsearch (9200), MongoDB (27017)
          </p>
        </div>
        <button
          onClick={() => setRfc1918Config({ sensitive_ports: DEFAULT_PORTS })}
          className="text-[11px] text-red-600 dark:text-red-400 hover:underline"
        >
          Reset to defaults
        </button>
      </div>
    );
  }

  if (conditionType === 'firewall_rule_descriptions') {
    return (
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Rule Description Governance</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Checks that every inbound and outbound rule on the firewall has a non-empty description. No additional configuration required — this rule flags all rules without a description.
        </p>
        <div className="rounded-md bg-blue-100 dark:bg-blue-900/40 px-3 py-2">
          <p className="text-[11px] text-blue-800 dark:text-blue-200">All rules missing a description will be reported as non-compliant.</p>
        </div>
      </div>
    );
  }

  if (conditionType === 'firewall_no_duplicate_rules') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Duplicate Rule Detection</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Detects inbound and outbound rules that are exact duplicates — identical action, protocol, port range and address set. No additional configuration required.
        </p>
        <div className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-2">
          <p className="text-[11px] text-slate-700 dark:text-slate-300">Duplicate rules are compared by action, protocol, ports and source/destination addresses.</p>
        </div>
      </div>
    );
  }

  if (conditionType === 'firewall_all_ports_allowed') {
    return (
      <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-3 space-y-3">
        <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">All-Ports Rule Detection</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Flags rules that permit traffic on all ports — via protocol <code className="font-mono bg-orange-100 dark:bg-orange-800 px-0.5 rounded text-[10px]">ALL</code>, an empty port field, or the range <code className="font-mono bg-orange-100 dark:bg-orange-800 px-0.5 rounded text-[10px]">1-65535</code>.
        </p>
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Check directions</label>
          <div className="flex flex-col gap-1.5">
            {[
              { key: 'check_inbound', label: 'Check inbound rules' },
              { key: 'check_outbound', label: 'Check outbound rules' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={(allPortsConfig as any)[key]}
                  onChange={e => setAllPortsConfig({ ...allPortsConfig, [key]: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Rule actions to flag</label>
          <div className="flex gap-2 mt-1">
            {['ACCEPT', 'DROP'].map(action => (
              <label key={action} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allPortsConfig.actions.includes(action)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...allPortsConfig.actions, action]
                      : allPortsConfig.actions.filter((a: string) => a !== action);
                    setAllPortsConfig({ ...allPortsConfig, actions: next });
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{action}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Select ACCEPT to flag permissive rules. Select DROP to also flag broad deny rules.</p>
        </div>
      </div>
    );
  }

  if (conditionType === 'linode_plan_tier_by_tag') {
    const PLAN_TIERS = [
      { value: 'nanode', label: 'Nanode', description: 'Shared CPU, entry-level (1 vCPU, 1GB RAM)' },
      { value: 'standard', label: 'Linode (Standard)', description: 'Shared CPU, general purpose' },
      { value: 'dedicated', label: 'Dedicated CPU', description: 'Dedicated CPU cores, no noisy-neighbor' },
      { value: 'highmem', label: 'High Memory', description: 'Memory-optimised, shared CPU' },
      { value: 'gpu', label: 'GPU', description: 'NVIDIA GPU instances' },
    ];

    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-4">
        <div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Plan Tier by Tag</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Linodes matching the tag filter below must use one of the approved plan tiers. Instances without the tag are marked not applicable.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Tag key</label>
            <input
              type="text"
              list="planTierTagKeySuggestions"
              value={planTierConfig.tag}
              onChange={e => setPlanTierConfig({ ...planTierConfig, tag: e.target.value })}
              placeholder="e.g. environment"
              className="mt-0.5 w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <datalist id="planTierTagKeySuggestions">{SUGGESTED_TAG_KEYS.map(k => <option key={k} value={k} />)}</datalist>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
              Tag value <span className="font-normal text-gray-400">(leave blank to match any value)</span>
            </label>
            <input
              type="text"
              list="planTierTagValueSuggestions"
              value={planTierConfig.tag_value}
              onChange={e => setPlanTierConfig({ ...planTierConfig, tag_value: e.target.value })}
              placeholder="e.g. production"
              className="mt-0.5 w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <datalist id="planTierTagValueSuggestions">{ENVIRONMENT_VALUES.map(v => <option key={v} value={v} />)}</datalist>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Approved plan tiers <span className="font-normal text-gray-400">(select at least one)</span>
          </p>
          <div className="space-y-2">
            {PLAN_TIERS.map(tier => (
              <label key={tier.value} className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={planTierConfig.approved_tiers.includes(tier.value)}
                  onChange={e => setPlanTierConfig({
                    ...planTierConfig,
                    approved_tiers: e.target.checked
                      ? [...planTierConfig.approved_tiers, tier.value]
                      : planTierConfig.approved_tiers.filter(t => t !== tier.value),
                  })}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 flex-shrink-0"
                />
                <div>
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{tier.label}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{tier.description}</p>
                </div>
              </label>
            ))}
          </div>
          {planTierConfig.approved_tiers.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1.5">Select at least one approved tier.</p>
          )}
        </div>

        {planTierConfig.tag && planTierConfig.approved_tiers.length > 0 && (
          <div className="rounded-md bg-amber-100 dark:bg-amber-900/40 px-3 py-2">
            <p className="text-[11px] text-amber-800 dark:text-amber-200 font-medium">
              Linodes tagged <code className="font-mono bg-amber-200 dark:bg-amber-800 px-0.5 rounded">{planTierConfig.tag}{planTierConfig.tag_value ? `:${planTierConfig.tag_value}` : ''}</code> must use a <strong>{planTierConfig.approved_tiers.join(' or ')}</strong> plan tier.
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
