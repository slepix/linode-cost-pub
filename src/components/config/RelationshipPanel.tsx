import { useState, useEffect } from 'react';
import {
  GitFork, Server, HardDrive, Network, Database, Container, Package, Shield,
  Loader2, ArrowRight, Filter, Waypoints, Globe, ChevronDown,
  ChevronRight as ChevronRightIcon, Scale, Archive, MapPin,
} from 'lucide-react';
import { getResourceRelationships, getResources } from '../../lib/api';

interface RelationshipPanelProps {
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
  vpc: Waypoints,
};

const resourceTypeColors: Record<string, string> = {
  linode: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  volume: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  nodebalancer: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-700',
  database: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  lke_cluster: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700',
  firewall: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600',
  object_storage: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  vpc: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700',
};

const relationshipLabels: Record<string, string> = {
  protects: 'PROTECTS',
  attached_to: 'ATTACHED TO',
  load_balances: 'LOAD BALANCES',
  hosts_node: 'HOSTS NODE',
  contains: 'CONTAINS',
};

function StatusDot({ status }: { status?: string }) {
  const good = status === 'running' || status === 'enabled' || status === 'active';
  if (!status) return null;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${
      good
        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }`}>
      {status}
    </span>
  );
}

function ResourceChip({ resource, size = 'md' }: { resource: any; size?: 'sm' | 'md' }) {
  const Icon = resourceTypeIcons[resource.resource_type] || Server;
  const color = resourceTypeColors[resource.resource_type] || resourceTypeColors.linode;
  const extraLabel = resource.resource_type === 'volume' && resource.specs?.size
    ? `${resource.specs.size} GB`
    : resource.resource_type === 'database' && resource.specs?.engine
      ? resource.specs.engine.toUpperCase()
      : null;
  const iconSize = size === 'sm' ? 10 : 12;
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';
  return (
    <div className={`inline-flex items-center gap-1.5 ${padding} rounded-lg border text-xs font-medium ${color}`}>
      <Icon size={iconSize} />
      <span className={`truncate ${size === 'sm' ? 'max-w-[90px]' : 'max-w-[130px]'}`}>{resource.label}</span>
      {extraLabel && <span className="text-[9px] opacity-60 font-normal">{extraLabel}</span>}
      <StatusDot status={resource.status} />
    </div>
  );
}

interface SubnetEntry {
  label: string;
  ipv4: string;
  id: number;
  linodes: any[];
  databases: any[];
}

interface VpcEntry {
  vpc: any;
  subnets: SubnetEntry[];
}

interface RegionGroup {
  region: string;
  vpcs: VpcEntry[];
  outsideResources: any[];
}

function AttachedChips({ resourceId, firewallsByTarget, volumesByTarget }: {
  resourceId: string;
  firewallsByTarget: Record<string, any[]>;
  volumesByTarget: Record<string, any[]>;
}) {
  const firewalls = firewallsByTarget[resourceId] || [];
  const volumes = volumesByTarget[resourceId] || [];
  if (firewalls.length === 0 && volumes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 ml-1">
      {firewalls.map((fw: any) => (
        <div key={fw.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700">
          <Shield size={9} />
          <span className="truncate max-w-[80px]">{fw.label}</span>
          <StatusDot status={fw.status} />
        </div>
      ))}
      {volumes.map((vol: any) => (
        <div key={vol.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700">
          <HardDrive size={9} />
          <span className="truncate max-w-[80px]">{vol.label}</span>
          {vol.specs?.size && <span className="text-[8px] opacity-60">{vol.specs.size}GB</span>}
        </div>
      ))}
    </div>
  );
}

function SubnetBlock({ subnet, firewallsByTarget, volumesByTarget }: {
  subnet: SubnetEntry;
  firewallsByTarget: Record<string, any[]>;
  volumesByTarget: Record<string, any[]>;
}) {
  const allResources = [...subnet.linodes, ...subnet.databases];
  return (
    <div className="rounded-lg border border-dashed border-blue-200 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-900/5 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Network size={11} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">{subnet.label}</span>
        {subnet.ipv4 && (
          <span className="font-mono text-[9px] text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
            {subnet.ipv4}
          </span>
        )}
      </div>
      {allResources.length === 0 ? (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic pl-1">No resources</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allResources.map((res: any) => (
            <div key={res.id} className="flex flex-col">
              <ResourceChip resource={res} />
              <AttachedChips
                resourceId={res.id}
                firewallsByTarget={firewallsByTarget}
                volumesByTarget={volumesByTarget}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VpcBlock({ vpcEntry, firewallsByTarget, volumesByTarget }: {
  vpcEntry: VpcEntry;
  firewallsByTarget: Record<string, any[]>;
  volumesByTarget: Record<string, any[]>;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalResources = vpcEntry.subnets.reduce((s, sn) => s + sn.linodes.length + sn.databases.length, 0);

  return (
    <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/20 dark:bg-teal-900/5 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-teal-50/60 dark:hover:bg-teal-900/10 transition-colors"
      >
        <Waypoints size={13} className="text-teal-600 dark:text-teal-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">{vpcEntry.vpc.label}</span>
        {vpcEntry.vpc.status === 'active' && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
        )}
        <span className="ml-auto text-[10px] text-teal-500 dark:text-teal-400 font-normal">
          {vpcEntry.subnets.length} subnet{vpcEntry.subnets.length !== 1 ? 's' : ''} · {totalResources} resource{totalResources !== 1 ? 's' : ''}
        </span>
        {expanded ? <ChevronDown size={13} className="text-teal-400 flex-shrink-0" /> : <ChevronRightIcon size={13} className="text-teal-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2">
          {vpcEntry.subnets.map((subnet, i) => (
            <SubnetBlock
              key={subnet.id !== -1 ? subnet.id : i}
              subnet={subnet}
              firewallsByTarget={firewallsByTarget}
              volumesByTarget={volumesByTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutsideResourcesBlock({ resources, firewallsByTarget, volumesByTarget }: {
  resources: any[];
  firewallsByTarget: Record<string, any[]>;
  volumesByTarget: Record<string, any[]>;
}) {
  if (resources.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/20 p-3">
      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Outside VPC</p>
      <div className="flex flex-wrap gap-2">
        {resources.map((res: any) => (
          <div key={res.id} className="flex flex-col">
            <ResourceChip resource={res} />
            <AttachedChips
              resourceId={res.id}
              firewallsByTarget={firewallsByTarget}
              volumesByTarget={volumesByTarget}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionCard({ group, firewallsByTarget, volumesByTarget }: {
  group: RegionGroup;
  firewallsByTarget: Record<string, any[]>;
  volumesByTarget: Record<string, any[]>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasVpcs = group.vpcs.length > 0;
  const hasOutside = group.outsideResources.length > 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <MapPin size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-widest">{group.region}</span>
        <div className="flex items-center gap-1.5 ml-2">
          {hasVpcs && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 font-semibold">
              {group.vpcs.length} VPC{group.vpcs.length !== 1 ? 's' : ''}
            </span>
          )}
          {hasOutside && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold">
              {group.outsideResources.length} standalone
            </span>
          )}
        </div>
        <div className="ml-auto">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRightIcon size={14} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {group.vpcs.map((vpcEntry, i) => (
            <VpcBlock
              key={vpcEntry.vpc.id ?? i}
              vpcEntry={vpcEntry}
              firewallsByTarget={firewallsByTarget}
              volumesByTarget={volumesByTarget}
            />
          ))}
          <OutsideResourcesBlock
            resources={group.outsideResources}
            firewallsByTarget={firewallsByTarget}
            volumesByTarget={volumesByTarget}
          />
        </div>
      )}
    </div>
  );
}

export function RelationshipPanel({ accountId }: RelationshipPanelProps) {
  const [relationships, setRelationships] = useState<any[]>([]);
  const [allResources, setAllResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'topology' | 'grouped' | 'list'>('topology');

  useEffect(() => {
    load();
  }, [accountId]);

  async function load() {
    setLoading(true);
    try {
      const [rels, resources] = await Promise.all([
        getResourceRelationships(accountId),
        getResources(accountId),
      ]);
      setRelationships(rels);
      setAllResources(resources);
    } catch {}
    setLoading(false);
  }

  const containsRels = relationships.filter(r => r.relationship_type === 'contains');
  const protectsRels = relationships.filter(r => r.relationship_type === 'protects');
  const attachedRels = relationships.filter(r => r.relationship_type === 'attached_to');
  const otherRels = relationships.filter(r => !['contains', 'protects', 'attached_to'].includes(r.relationship_type));

  const firewallsByTarget: Record<string, any[]> = {};
  for (const rel of protectsRels) {
    if (!rel.target) continue;
    const key = rel.target.id;
    if (!firewallsByTarget[key]) firewallsByTarget[key] = [];
    if (rel.source) firewallsByTarget[key].push(rel.source);
  }

  const volumesByTarget: Record<string, any[]> = {};
  for (const rel of attachedRels) {
    if (!rel.target) continue;
    const key = rel.target.id;
    if (!volumesByTarget[key]) volumesByTarget[key] = [];
    if (rel.source) volumesByTarget[key].push(rel.source);
  }

  // Track all resource IDs placed inside a VPC subnet
  const resourceIdsInVpc = new Set<string>();

  // Build region → vpc → subnet hierarchy
  const regionMap = new Map<string, RegionGroup>();

  function getRegionGroup(region: string): RegionGroup {
    if (!regionMap.has(region)) {
      regionMap.set(region, { region, vpcs: [], outsideResources: [] });
    }
    return regionMap.get(region)!;
  }

  const vpcEntryMap = new Map<string, VpcEntry>();

  for (const rel of containsRels) {
    if (!rel.source || !rel.target) continue;
    const vpc = rel.source;
    const member = rel.target;
    const metadata = rel.metadata || {};
    const region = metadata.region || vpc.region || member.region || 'unknown';

    const regionGroup = getRegionGroup(region);

    if (!vpcEntryMap.has(vpc.id)) {
      const entry: VpcEntry = { vpc, subnets: [] };
      vpcEntryMap.set(vpc.id, entry);
      regionGroup.vpcs.push(entry);
    }
    const vpcEntry = vpcEntryMap.get(vpc.id)!;

    const subnetLabel = metadata.subnet_label || 'default';
    const subnetIpv4 = metadata.subnet_ipv4 || '';
    const subnetId = metadata.subnet_id ?? -1;

    let subnet = vpcEntry.subnets.find(s => s.id === subnetId);
    if (!subnet) {
      subnet = { label: subnetLabel, ipv4: subnetIpv4, id: subnetId, linodes: [], databases: [] };
      vpcEntry.subnets.push(subnet);
    }

    if (metadata.member_type === 'database' || member.resource_type === 'database') {
      if (!subnet.databases.find((d: any) => d.id === member.id)) {
        subnet.databases.push(member);
        resourceIdsInVpc.add(member.id);
      }
    } else {
      if (!subnet.linodes.find((l: any) => l.id === member.id)) {
        subnet.linodes.push(member);
        resourceIdsInVpc.add(member.id);
      }
    }
  }

  // Place standalone resources (linodes, databases, lke, nodebalancers, object_storage, volumes)
  // that are not in any VPC into their region's outsideResources
  const outsideTypes = new Set(['linode', 'database', 'lke_cluster', 'nodebalancer', 'object_storage', 'volume']);
  for (const res of allResources) {
    if (!outsideTypes.has(res.resource_type)) continue;
    if (resourceIdsInVpc.has(res.id)) continue;
    const region = res.region || 'unknown';
    getRegionGroup(region).outsideResources.push(res);
  }

  // Sort regions
  const regionGroups = Array.from(regionMap.values())
    .filter(g => g.vpcs.length > 0 || g.outsideResources.length > 0)
    .sort((a, b) => a.region.localeCompare(b.region));

  // Firewalls protecting resources not in any VPC → show in "Other Relationships"
  const resourceIdsInTopology = new Set([...resourceIdsInVpc, ...allResources.map(r => r.id)]);
  const nonTopologyRels = [
    ...protectsRels.filter(r => r.target && !resourceIdsInTopology.has(r.target.id)),
    ...otherRels,
  ];

  const relTypes = ['all', ...Array.from(new Set(relationships.map(r => r.relationship_type)))];
  const filtered = filterType === 'all' ? relationships : relationships.filter(r => r.relationship_type === filterType);

  const groupedBySource: Record<string, any[]> = {};
  for (const rel of filtered) {
    const key = rel.source_id;
    if (!groupedBySource[key]) groupedBySource[key] = [];
    groupedBySource[key].push(rel);
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {relationships.length} relationship{relationships.length !== 1 ? 's' : ''} mapped across your resources.
        </p>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {relTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All relationships' : relationshipLabels[t] || t}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['topology', 'grouped', 'list'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1.5 text-xs transition-colors capitalize ${viewMode === mode ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'topology' && (
        regionGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <GitFork size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No topology data available</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              Sync your account to map relationships between resources.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {regionGroups.map(group => (
              <RegionCard
                key={group.region}
                group={group}
                firewallsByTarget={firewallsByTarget}
                volumesByTarget={volumesByTarget}
              />
            ))}

            {nonTopologyRels.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <GitFork size={12} />
                  Other Relationships
                </h3>
                <div className="space-y-3">
                  {Object.entries(
                    nonTopologyRels.reduce((acc: Record<string, any[]>, rel) => {
                      if (!acc[rel.source_id]) acc[rel.source_id] = [];
                      acc[rel.source_id].push(rel);
                      return acc;
                    }, {})
                  ).map(([, rels]) => {
                    const source = rels[0].source;
                    if (!source) return null;
                    return (
                      <div key={rels[0].source_id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 pt-1">
                            <ResourceChip resource={source} />
                          </div>
                          <div className="flex-1 space-y-2">
                            {rels.map(rel => (
                              <div key={rel.id} className="flex items-center gap-2">
                                <ArrowRight size={14} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide min-w-[70px]">
                                  {relationshipLabels[rel.relationship_type] || rel.relationship_type}
                                </span>
                                {rel.target && <ResourceChip resource={rel.target} />}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {viewMode === 'grouped' && (
        filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <GitFork size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No relationships found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedBySource).map(([, rels]) => {
              const source = rels[0].source;
              if (!source) return null;
              return (
                <div key={rels[0].source_id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 pt-1">
                      <ResourceChip resource={source} />
                    </div>
                    <div className="flex-1 space-y-2">
                      {rels.map(rel => (
                        <div key={rel.id} className="flex items-center gap-2">
                          <ArrowRight size={14} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide min-w-[70px]">
                            {relationshipLabels[rel.relationship_type] || rel.relationship_type}
                          </span>
                          {rel.target && <ResourceChip resource={rel.target} />}
                          {rel.metadata?.subnet_label && (
                            <span className="text-[9px] text-gray-400 dark:text-gray-500 italic">
                              via {rel.metadata.subnet_label} ({rel.metadata.subnet_ipv4})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {viewMode === 'list' && (
        filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <GitFork size={36} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No relationships found</p>
          </div>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Relationship</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Target</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Region</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(rel => (
                  <tr key={rel.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      {rel.source && <ResourceChip resource={rel.source} />}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                        {relationshipLabels[rel.relationship_type] || rel.relationship_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rel.target && <ResourceChip resource={rel.target} />}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                      {rel.metadata?.region || rel.source?.region || rel.target?.region || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                      {rel.metadata?.subnet_label
                        ? <span>{rel.metadata.subnet_label} <span className="font-mono">({rel.metadata.subnet_ipv4})</span></span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
