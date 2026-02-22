import { useState, useMemo } from 'react';
import {
  ArrowLeft, Server, HardDrive, Package, Container, Database,
  Network, Shield, Waypoints, MapPin, Search, X, ChevronDown,
  ChevronUp, DollarSign, Filter,
} from 'lucide-react';
import type { Resource } from '../types';

const RESOURCE_TYPE_META: Record<string, { label: string; icon: typeof Server; color: string; bgColor: string; borderColor: string }> = {
  linode:         { label: 'Virtual Machines',  icon: Server,    color: 'text-blue-600 dark:text-blue-400',    bgColor: 'bg-blue-50 dark:bg-blue-900/20',    borderColor: 'border-blue-200 dark:border-blue-800' },
  volume:         { label: 'Block Storage',     icon: HardDrive, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20', borderColor: 'border-orange-200 dark:border-orange-800' },
  object_storage: { label: 'Object Storage',   icon: Package,   color: 'text-teal-600 dark:text-teal-400',    bgColor: 'bg-teal-50 dark:bg-teal-900/20',    borderColor: 'border-teal-200 dark:border-teal-800' },
  lke_cluster:    { label: 'Kubernetes',        icon: Container, color: 'text-cyan-600 dark:text-cyan-400',    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',    borderColor: 'border-cyan-200 dark:border-cyan-800' },
  database:       { label: 'Databases',         icon: Database,  color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20', borderColor: 'border-emerald-200 dark:border-emerald-800' },
  nodebalancer:   { label: 'Load Balancers',    icon: Network,   color: 'text-sky-600 dark:text-sky-400',      bgColor: 'bg-sky-50 dark:bg-sky-900/20',      borderColor: 'border-sky-200 dark:border-sky-800' },
  firewall:       { label: 'Firewalls',         icon: Shield,    color: 'text-gray-600 dark:text-gray-400',    bgColor: 'bg-gray-50 dark:bg-gray-700/40',    borderColor: 'border-gray-200 dark:border-gray-700' },
  vpc:            { label: 'VPC',               icon: Waypoints, color: 'text-rose-600 dark:text-rose-400',    bgColor: 'bg-rose-50 dark:bg-rose-900/20',    borderColor: 'border-rose-200 dark:border-rose-800' },
};

function getTypeMeta(type: string) {
  return RESOURCE_TYPE_META[type] ?? {
    label: type.replace(/_/g, ' '),
    icon: Server,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-700/40',
    borderColor: 'border-gray-200 dark:border-gray-700',
  };
}

function statusDot(status?: string) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === 'running' || s === 'active') return 'bg-emerald-400';
  if (s === 'offline' || s === 'stopped') return 'bg-gray-400';
  if (s === 'provisioning' || s === 'booting') return 'bg-amber-400';
  if (s === 'error') return 'bg-red-400';
  return 'bg-gray-300';
}

interface Props {
  region: string;
  resources: Resource[];
  onBack: () => void;
}

export function RegionInventoryView({ region, resources, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'label' | 'cost'>('cost');

  const regionResources = resources.filter(r => (r.region ?? '') === region);

  const allTypes = useMemo(() => {
    const types = Array.from(new Set(regionResources.map(r => r.resource_type)));
    return types.sort();
  }, [regionResources]);

  const filtered = useMemo(() => {
    return regionResources.filter(r => {
      const matchesType = selectedTypes.size === 0 || selectedTypes.has(r.resource_type);
      const matchesSearch = !search || r.label.toLowerCase().includes(search.toLowerCase()) || (r.region ?? '').toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [regionResources, selectedTypes, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const r of filtered) {
      const arr = map.get(r.resource_type) ?? [];
      arr.push(r);
      map.set(r.resource_type, arr);
    }
    const entries = Array.from(map.entries()).map(([type, items]) => ({
      type,
      items: [...items].sort((a, b) =>
        sortBy === 'cost'
          ? (b.monthly_cost || 0) - (a.monthly_cost || 0)
          : a.label.localeCompare(b.label)
      ),
    }));
    entries.sort((a, b) => {
      if (sortBy === 'cost') {
        const aC = a.items.reduce((s, r) => s + (r.monthly_cost || 0), 0);
        const bC = b.items.reduce((s, r) => s + (r.monthly_cost || 0), 0);
        return bC - aC;
      }
      return a.type.localeCompare(b.type);
    });
    return entries;
  }, [filtered, sortBy]);

  const totalCost = regionResources.reduce((s, r) => s + (r.monthly_cost || 0), 0);
  const filteredCost = filtered.reduce((s, r) => s + (r.monthly_cost || 0), 0);

  function toggleType(type: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  function toggleCollapse(type: string) {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  const hasFilters = search || selectedTypes.size > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{region}</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {regionResources.length} resource{regionResources.length !== 1 ? 's' : ''} &middot; {allTypes.length} type{allTypes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-400 dark:text-gray-500">Monthly cost</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-50">${totalCost.toFixed(2)}</p>
          </div>
          <div className="w-px h-10 bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <DollarSign size={13} className="text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{region}</span>
          </div>
        </div>
      </div>

      {/* Type summary chips */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {allTypes.map(type => {
            const meta = getTypeMeta(type);
            const Icon = meta.icon;
            const typeItems = regionResources.filter(r => r.resource_type === type);
            const typeCost = typeItems.reduce((s, r) => s + (r.monthly_cost || 0), 0);
            const isSelected = selectedTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? `${meta.bgColor} ${meta.borderColor} ring-2 ring-offset-1 ring-blue-400 dark:ring-blue-500`
                    : `${meta.bgColor} ${meta.borderColor} hover:shadow-sm hover:scale-[1.01]`
                }`}
              >
                <div className="p-1.5 rounded-md bg-white dark:bg-gray-800 shadow-sm flex-shrink-0">
                  <Icon size={14} className={meta.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{meta.label}</p>
                  <p className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">{typeItems.length}</p>
                  {typeCost > 0 && (
                    <p className={`text-[10px] font-medium ${meta.color}`}>${typeCost.toFixed(2)}/mo</p>
                  )}
                </div>
                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-blue-500 dark:bg-blue-400 flex items-center justify-center flex-shrink-0">
                    <X size={9} className="text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + sort toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search resources..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={14} />
            </button>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setSelectedTypes(new Set()); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Filter size={12} />
            Clear filters
          </button>
        )}

        <div className="flex items-center gap-1 p-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
          {(['cost', 'label'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                sortBy === opt
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {opt === 'cost' ? 'By cost' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>

      {/* Results summary */}
      {hasFilters && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {filtered.length} of {regionResources.length} resources &middot; ${filteredCost.toFixed(2)}/mo
        </p>
      )}

      {/* Grouped resource lists */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No resources match your filters</p>
          <button onClick={() => { setSearch(''); setSelectedTypes(new Set()); }} className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ type, items }) => {
            const meta = getTypeMeta(type);
            const Icon = meta.icon;
            const isCollapsed = collapsedTypes.has(type);
            const groupCost = items.reduce((s, r) => s + (r.monthly_cost || 0), 0);

            return (
              <div key={type} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleCollapse(type)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className={`p-1.5 rounded-md ${meta.bgColor} flex-shrink-0`}>
                    <Icon size={14} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{meta.label}</span>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{items.length} resource{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  {groupCost > 0 && (
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 mr-2">${groupCost.toFixed(2)}/mo</span>
                  )}
                  {isCollapsed ? <ChevronDown size={15} className="text-gray-400 dark:text-gray-500 flex-shrink-0" /> : <ChevronUp size={15} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />}
                </button>

                {!isCollapsed && (
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map(resource => {
                      const dot = statusDot(resource.status);
                      const tags: string[] = resource.specs?.tags ?? [];
                      return (
                        <div key={resource.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {dot && <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{resource.label}</span>
                              {resource.status && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                  {resource.status}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {resource.plan_type && (
                                <span className="text-[11px] text-gray-400 dark:text-gray-500">{resource.plan_type}</span>
                              )}
                              {tags.slice(0, 4).map(tag => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400">
                                  {tag}
                                </span>
                              ))}
                              {tags.length > 4 && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">+{tags.length - 4} more</span>
                              )}
                            </div>
                          </div>
                          {(resource.monthly_cost || 0) > 0 && (
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">${(resource.monthly_cost || 0).toFixed(2)}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500">/mo</p>
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
        </div>
      )}
    </div>
  );
}
