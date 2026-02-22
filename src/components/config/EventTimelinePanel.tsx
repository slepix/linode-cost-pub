import { useState, useEffect } from 'react';
import { ActivitySquare, Loader2, Filter, Search, CheckCircle, XCircle, Clock, Info, Calendar, X } from 'lucide-react';
import { getLinodeEvents } from '../../lib/api';
import type { LinodeEvent } from '../../types';

interface EventTimelinePanelProps {
  accountId: string;
}

const G = {
  create: 'text-blue-600 dark:text-blue-400',
  delete: 'text-red-600 dark:text-red-400',
  update: 'text-amber-600 dark:text-amber-400',
  boot: 'text-green-600 dark:text-green-400',
  shutdown: 'text-amber-600 dark:text-amber-400',
  reboot: 'text-amber-600 dark:text-amber-400',
  migrate: 'text-sky-600 dark:text-sky-400',
  resize: 'text-blue-600 dark:text-blue-400',
  rebuild: 'text-amber-600 dark:text-amber-400',
  restore: 'text-blue-600 dark:text-blue-400',
  attach: 'text-blue-600 dark:text-blue-400',
  detach: 'text-amber-600 dark:text-amber-400',
  enable: 'text-green-600 dark:text-green-400',
  disable: 'text-amber-600 dark:text-amber-400',
  apply: 'text-blue-600 dark:text-blue-400',
  failed: 'text-red-600 dark:text-red-400',
  muted: 'text-gray-500 dark:text-gray-400',
};

const ACTION_CATEGORIES: Record<string, { label: string; color: string }> = {
  // Account
  account_agreement_eu_model: { label: 'EU Model Agreement', color: G.muted },
  account_promo_apply: { label: 'Promo Applied', color: G.create },
  account_update: { label: 'Account Updated', color: G.update },
  account_settings_update: { label: 'Settings Updated', color: G.update },
  credit_card_updated: { label: 'Credit Card Updated', color: G.update },
  payment_method_add: { label: 'Payment Method Added', color: G.create },
  payment_submitted: { label: 'Payment Submitted', color: G.create },
  tax_id_valid: { label: 'Tax ID Validated', color: G.enable },
  tax_id_invalid: { label: 'Tax ID Invalid', color: G.failed },
  tfa_enabled: { label: '2FA Enabled', color: G.enable },
  tfa_disabled: { label: '2FA Disabled', color: G.disable },
  password_reset: { label: 'Password Reset', color: G.update },
  profile_update: { label: 'Profile Updated', color: G.update },

  // User & Tokens
  user_create: { label: 'User Created', color: G.create },
  user_update: { label: 'User Updated', color: G.update },
  user_delete: { label: 'User Deleted', color: G.delete },
  user_ssh_key_add: { label: 'SSH Key Added', color: G.create },
  user_ssh_key_delete: { label: 'SSH Key Deleted', color: G.delete },
  user_ssh_key_update: { label: 'SSH Key Updated', color: G.update },
  token_create: { label: 'Token Created', color: G.create },
  token_delete: { label: 'Token Deleted', color: G.delete },
  token_update: { label: 'Token Updated', color: G.update },
  oauth_client_create: { label: 'OAuth Client Created', color: G.create },
  oauth_client_delete: { label: 'OAuth Client Deleted', color: G.delete },
  oauth_client_secret_reset: { label: 'OAuth Secret Reset', color: G.update },
  oauth_client_update: { label: 'OAuth Client Updated', color: G.update },

  // Linode instances
  linode_boot: { label: 'Linode Boot', color: G.boot },
  linode_shutdown: { label: 'Linode Shutdown', color: G.shutdown },
  linode_reboot: { label: 'Linode Reboot', color: G.reboot },
  linode_create: { label: 'Linode Created', color: G.create },
  linode_delete: { label: 'Linode Deleted', color: G.delete },
  linode_update: { label: 'Linode Updated', color: G.update },
  linode_clone: { label: 'Linode Cloned', color: G.create },
  linode_resize: { label: 'Linode Resized', color: G.resize },
  linode_resize_create: { label: 'Linode Resize Queued', color: G.resize },
  linode_resize_warm_create: { label: 'Linode Warm Resize', color: G.resize },
  linode_migrate: { label: 'Linode Migrated', color: G.migrate },
  linode_migrate_datacenter: { label: 'Linode DC Migrate', color: G.migrate },
  linode_migrate_datacenter_create: { label: 'Linode DC Migrate Queued', color: G.migrate },
  linode_rebuild: { label: 'Linode Rebuilt', color: G.rebuild },
  linode_addip: { label: 'IP Added', color: G.create },
  linode_deleteip: { label: 'IP Removed', color: G.delete },
  linode_mutate: { label: 'Linode Mutated', color: G.update },
  linode_mutate_create: { label: 'Linode Mutate Queued', color: G.update },
  linode_kvmify: { label: 'KVM Migration', color: G.migrate },
  linode_snapshot: { label: 'Snapshot Created', color: G.create },
  linode_poweroff_on: { label: 'Power Cycled', color: G.reboot },
  linode_config_create: { label: 'Config Created', color: G.create },
  linode_config_delete: { label: 'Config Deleted', color: G.delete },
  linode_config_update: { label: 'Config Updated', color: G.update },
  host_reboot: { label: 'Host Rebooted', color: G.reboot },
  lassie_reboot: { label: 'Lassie Reboot', color: G.reboot },
  lish_boot: { label: 'Lish Boot', color: G.boot },
  ipaddress_update: { label: 'IP Updated', color: G.update },
  ipv6pool_add: { label: 'IPv6 Pool Added', color: G.create },
  ipv6pool_delete: { label: 'IPv6 Pool Deleted', color: G.delete },

  // Disks
  disk_create: { label: 'Disk Created', color: G.create },
  disk_delete: { label: 'Disk Deleted', color: G.delete },
  disk_update: { label: 'Disk Updated', color: G.update },
  disk_duplicate: { label: 'Disk Duplicated', color: G.create },
  disk_imagize: { label: 'Disk Imagized', color: G.create },
  disk_resize: { label: 'Disk Resized', color: G.resize },

  // Firewall
  firewall_create: { label: 'Firewall Created', color: G.create },
  firewall_delete: { label: 'Firewall Deleted', color: G.delete },
  firewall_update: { label: 'Firewall Updated', color: G.update },
  firewall_enable: { label: 'Firewall Enabled', color: G.enable },
  firewall_disable: { label: 'Firewall Disabled', color: G.disable },
  firewall_apply: { label: 'Firewall Applied', color: G.apply },
  firewall_rules_update: { label: 'Firewall Rules Updated', color: G.update },
  firewall_device_add: { label: 'Firewall Device Added', color: G.attach },
  firewall_device_remove: { label: 'Firewall Device Removed', color: G.detach },

  // Volumes
  volume_create: { label: 'Volume Created', color: G.create },
  volume_delete: { label: 'Volume Deleted', color: G.delete },
  volume_update: { label: 'Volume Updated', color: G.update },
  volume_attach: { label: 'Volume Attached', color: G.attach },
  volume_detach: { label: 'Volume Detached', color: G.detach },
  volume_clone: { label: 'Volume Cloned', color: G.create },
  volume_resize: { label: 'Volume Resized', color: G.resize },
  volume_migrate: { label: 'Volume Migrated', color: G.migrate },
  volume_migrate_scheduled: { label: 'Volume Migrate Scheduled', color: G.migrate },

  // LKE
  lke_cluster_create: { label: 'LKE Cluster Created', color: G.create },
  lke_cluster_update: { label: 'LKE Cluster Updated', color: G.update },
  lke_cluster_delete: { label: 'LKE Cluster Deleted', color: G.delete },
  lke_cluster_recycle: { label: 'LKE Cluster Recycled', color: G.reboot },
  lke_cluster_regenerate: { label: 'LKE Cluster Regenerated', color: G.update },
  lke_control_plane_acl_create: { label: 'LKE ACL Created', color: G.create },
  lke_control_plane_acl_update: { label: 'LKE ACL Updated', color: G.update },
  lke_control_plane_acl_delete: { label: 'LKE ACL Deleted', color: G.delete },
  lke_node_create: { label: 'LKE Node Created', color: G.create },
  lke_node_delete: { label: 'LKE Node Deleted', color: G.delete },
  lke_node_recycle: { label: 'LKE Node Recycled', color: G.reboot },
  lke_pool_create: { label: 'LKE Pool Created', color: G.create },
  lke_pool_delete: { label: 'LKE Pool Deleted', color: G.delete },
  lke_pool_recycle: { label: 'LKE Pool Recycled', color: G.reboot },
  lke_kubeconfig_regenerate: { label: 'Kubeconfig Regenerated', color: G.update },
  lke_token_rotate: { label: 'LKE Token Rotated', color: G.update },

  // Databases
  database_create: { label: 'DB Created', color: G.create },
  database_delete: { label: 'DB Deleted', color: G.delete },
  database_update: { label: 'DB Updated', color: G.update },
  database_failed: { label: 'DB Failed', color: G.failed },
  database_degraded: { label: 'DB Degraded', color: G.failed },
  database_create_failed: { label: 'DB Create Failed', color: G.failed },
  database_update_failed: { label: 'DB Update Failed', color: G.failed },
  database_backup_create: { label: 'DB Backup Created', color: G.create },
  database_backup_restore: { label: 'DB Backup Restored', color: G.restore },
  database_backup_delete: { label: 'DB Backup Deleted', color: G.delete },
  database_credentials_reset: { label: 'DB Credentials Reset', color: G.update },
  database_low_disk_space: { label: 'DB Low Disk', color: G.failed },
  database_scale: { label: 'DB Scaled', color: G.resize },
  database_resize: { label: 'DB Resized', color: G.resize },
  database_resize_create: { label: 'DB Resize Queued', color: G.resize },
  database_migrate: { label: 'DB Migrated', color: G.migrate },
  database_upgrade: { label: 'DB Upgraded', color: G.update },
  database_suspend: { label: 'DB Suspended', color: G.disable },
  database_resume: { label: 'DB Resumed', color: G.enable },

  // NodeBalancers
  nodebalancer_create: { label: 'NodeBalancer Created', color: G.create },
  nodebalancer_delete: { label: 'NodeBalancer Deleted', color: G.delete },
  nodebalancer_update: { label: 'NodeBalancer Updated', color: G.update },
  nodebalancer_config_create: { label: 'NB Config Created', color: G.create },
  nodebalancer_config_delete: { label: 'NB Config Deleted', color: G.delete },
  nodebalancer_config_update: { label: 'NB Config Updated', color: G.update },
  nodebalancer_node_create: { label: 'NB Node Created', color: G.create },
  nodebalancer_node_delete: { label: 'NB Node Deleted', color: G.delete },
  nodebalancer_node_update: { label: 'NB Node Updated', color: G.update },

  // Backups
  backups_enable: { label: 'Backups Enabled', color: G.enable },
  backups_cancel: { label: 'Backups Cancelled', color: G.disable },
  backups_restore: { label: 'Backup Restored', color: G.restore },

  // Images
  image_delete: { label: 'Image Deleted', color: G.delete },
  image_update: { label: 'Image Updated', color: G.update },
  image_upload: { label: 'Image Uploaded', color: G.create },

  // DNS
  dns_record_create: { label: 'DNS Record Created', color: G.create },
  dns_record_delete: { label: 'DNS Record Deleted', color: G.delete },
  dns_record_update: { label: 'DNS Record Updated', color: G.update },
  dns_zone_create: { label: 'DNS Zone Created', color: G.create },
  dns_zone_delete: { label: 'DNS Zone Deleted', color: G.delete },
  dns_zone_import: { label: 'DNS Zone Imported', color: G.create },
  dns_zone_update: { label: 'DNS Zone Updated', color: G.update },

  // VPC & Subnets
  vpc_create: { label: 'VPC Created', color: G.create },
  vpc_delete: { label: 'VPC Deleted', color: G.delete },
  vpc_update: { label: 'VPC Updated', color: G.update },
  subnet_create: { label: 'Subnet Created', color: G.create },
  subnet_delete: { label: 'Subnet Deleted', color: G.delete },
  subnet_update: { label: 'Subnet Updated', color: G.update },
  interface_create: { label: 'Interface Created', color: G.create },
  interface_delete: { label: 'Interface Deleted', color: G.delete },
  interface_update: { label: 'Interface Updated', color: G.update },
  vlan_attach: { label: 'VLAN Attached', color: G.attach },
  vlan_detach: { label: 'VLAN Detached', color: G.detach },

  // Placement Groups
  placement_group_create: { label: 'Placement Group Created', color: G.create },
  placement_group_delete: { label: 'Placement Group Deleted', color: G.delete },
  placement_group_update: { label: 'Placement Group Updated', color: G.update },
  placement_group_assign: { label: 'Placement Group Assigned', color: G.attach },
  placement_group_unassign: { label: 'Placement Group Unassigned', color: G.detach },
  placement_group_became_compliant: { label: 'PG Became Compliant', color: G.enable },
  placement_group_became_non_compliant: { label: 'PG Non-Compliant', color: G.failed },

  // StackScripts
  stackscript_create: { label: 'StackScript Created', color: G.create },
  stackscript_delete: { label: 'StackScript Deleted', color: G.delete },
  stackscript_update: { label: 'StackScript Updated', color: G.update },
  stackscript_publicize: { label: 'StackScript Publicized', color: G.update },
  stackscript_revise: { label: 'StackScript Revised', color: G.update },

  // Entity transfers
  entity_transfer_accept: { label: 'Transfer Accepted', color: G.enable },
  entity_transfer_accept_recipient: { label: 'Transfer Received', color: G.enable },
  entity_transfer_cancel: { label: 'Transfer Cancelled', color: G.disable },
  entity_transfer_create: { label: 'Transfer Created', color: G.create },
  entity_transfer_fail: { label: 'Transfer Failed', color: G.failed },
  entity_transfer_stale: { label: 'Transfer Stale', color: G.failed },

  // Tags
  tag_create: { label: 'Tag Created', color: G.create },
  tag_delete: { label: 'Tag Deleted', color: G.delete },
  tag_update: { label: 'Tag Updated', color: G.update },

  // Support tickets
  ticket_create: { label: 'Ticket Opened', color: G.muted },
  ticket_update: { label: 'Ticket Updated', color: G.muted },
  ticket_attachment_upload: { label: 'Ticket Attachment', color: G.muted },

  // Community
  community_question_reply: { label: 'Community Reply', color: G.muted },
  community_like: { label: 'Community Like', color: G.muted },
  community_mention: { label: 'Community Mention', color: G.muted },

  // Managed
  managed_disabled: { label: 'Managed Disabled', color: G.disable },
  managed_enabled: { label: 'Managed Enabled', color: G.enable },
  managed_service_create: { label: 'Managed Service Created', color: G.create },
  managed_service_delete: { label: 'Managed Service Deleted', color: G.delete },

  // Longview
  longviewclient_create: { label: 'Longview Created', color: G.create },
  longviewclient_delete: { label: 'Longview Deleted', color: G.delete },
  longviewclient_update: { label: 'Longview Updated', color: G.update },

  // Object Storage
  obj_access_key_create: { label: 'OBJ Key Created', color: G.create },
  obj_access_key_delete: { label: 'OBJ Key Deleted', color: G.delete },
  obj_access_key_update: { label: 'OBJ Key Updated', color: G.update },
};

const STATUS_CONFIG: Record<string, { icon: any; color: string }> = {
  finished: { icon: CheckCircle, color: 'text-green-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
  started: { icon: Clock, color: 'text-blue-500' },
  scheduled: { icon: Clock, color: 'text-gray-400' },
  notification: { icon: Info, color: 'text-blue-400' },
};

function formatActionLabel(action: string): string {
  return ACTION_CATEGORIES[action]?.label || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getActionColor(action: string): string {
  return ACTION_CATEGORIES[action]?.color || 'text-gray-600 dark:text-gray-400';
}

export function EventTimelinePanel({ accountId }: EventTimelinePanelProps) {
  const [events, setEvents] = useState<LinodeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  useEffect(() => {
    load();
  }, [accountId]);

  async function load() {
    setLoading(true);
    try {
      const data = await getLinodeEvents(accountId, 500);
      setEvents(data as LinodeEvent[]);
    } catch {}
    setLoading(false);
  }

  const entityTypes = ['all', ...Array.from(new Set(events.map(e => e.entity_type).filter(Boolean)))];
  const statuses = ['all', ...Array.from(new Set(events.map(e => e.status).filter(Boolean)))];

  const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : null;
  const dateToMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;

  const filtered = events.filter(e => {
    if (filterEntity !== 'all' && e.entity_type !== filterEntity) return false;
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (dateFromMs !== null && e.event_created) {
      if (new Date(e.event_created).getTime() < dateFromMs) return false;
    }
    if (dateToMs !== null && e.event_created) {
      if (new Date(e.event_created).getTime() > dateToMs) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.action?.toLowerCase().includes(q) ||
        e.entity_label?.toLowerCase().includes(q) ||
        e.message?.toLowerCase().includes(q) ||
        e.username?.toLowerCase().includes(q) ||
        e.secondary_entity_label?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasDateFilter = dateFrom !== '' || dateTo !== '';

  const groupedByDate: Record<string, LinodeEvent[]> = {};
  for (const ev of filtered) {
    const date = ev.event_created
      ? new Date(ev.event_created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown date';
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(ev);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search events…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <Calendar size={12} className={`flex-shrink-0 ${hasDateFilter ? 'text-blue-500' : 'text-gray-400'}`} />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="From date"
            className="text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none w-[115px] [color-scheme:light] dark:[color-scheme:dark]"
          />
          <span className="text-gray-300 dark:text-gray-600 text-xs">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="To date"
            className="text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none w-[115px] [color-scheme:light] dark:[color-scheme:dark]"
          />
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="ml-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Clear date filter"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400 flex-shrink-0" />
          <select
            value={filterEntity}
            onChange={e => setFilterEntity(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {entityTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All entities' : t}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {statuses.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <ActivitySquare size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No events found</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Linode account events are fetched automatically on each sync.</p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groupedByDate).map(([date, evs]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{date}</span>
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-800" />
              <div className="space-y-1">
                {evs.map(ev => {
                  const stConf = STATUS_CONFIG[ev.status || ''] || STATUS_CONFIG.notification;
                  const StatusIcon = stConf.icon;
                  const actionColor = getActionColor(ev.action);
                  return (
                    <div key={ev.id} className="relative flex items-start gap-3 pl-2 pr-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                      <div className="relative z-10 w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <StatusIcon size={13} className={stConf.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${actionColor}`}>{formatActionLabel(ev.action)}</span>
                          {ev.entity_label && (
                            <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">{ev.entity_label}</span>
                          )}
                          {ev.secondary_entity_label && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">via {ev.secondary_entity_label}</span>
                          )}
                        </div>
                        {ev.message && ev.message !== 'None' && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{ev.message}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {ev.username && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{ev.username}</span>
                          )}
                          {ev.duration && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">· {ev.duration.toFixed(1)}s</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {ev.event_created ? new Date(ev.event_created).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        {ev.status && ev.status !== 'notification' && (
                          <p className={`text-[10px] capitalize font-medium ${stConf.color}`}>{ev.status}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
