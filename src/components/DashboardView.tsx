import { useState } from 'react';
import { Server, HardDrive, Package, Container, Database, Network, Shield, TrendingDown, DollarSign, Activity, Tag, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { CostOverview } from './CostOverview';
import { BudgetAlerts } from './BudgetAlerts';
import { ComplianceSummaryCard } from './ComplianceSummaryCard';
import type { Resource } from '../types';
import type { NavSection } from './Sidebar';

interface ResourceTypeCard {
  key: Exclude<NavSection, 'dashboard'>;
  label: string;
  icon: typeof Server;
  color: string;
  bgColor: string;
  borderColor: string;
}

const resourceTypeCards: ResourceTypeCard[] = [
  { key: 'linode', label: 'Virtual Machines', icon: Server, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20', borderColor: 'border-blue-200 dark:border-blue-800' },
  { key: 'volume', label: 'Block Storage', icon: HardDrive, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20', borderColor: 'border-orange-200 dark:border-orange-800' },
  { key: 'object_storage', label: 'Object Storage', icon: Package, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-50 dark:bg-teal-900/20', borderColor: 'border-teal-200 dark:border-teal-800' },
  { key: 'lke_cluster', label: 'Kubernetes', icon: Container, color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-900/20', borderColor: 'border-cyan-200 dark:border-cyan-800' },
  { key: 'database', label: 'Databases', icon: Database, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20', borderColor: 'border-emerald-200 dark:border-emerald-800' },
  { key: 'nodebalancer', label: 'Load Balancers', icon: Network, color: 'text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-50 dark:bg-sky-900/20', borderColor: 'border-sky-200 dark:border-sky-800' },
  { key: 'firewall', label: 'Firewalls', icon: Shield, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-700/40', borderColor: 'border-gray-200 dark:border-gray-700' },
];

interface DashboardViewProps {
  accountId: string | null;
  resources: Resource[];
  totalCost: number;
  refreshTrigger: number;
  onSectionChange: (section: NavSection) => void;
  onRegionSelect: (region: string) => void;
}

const TAG_COLORS = [
  { bar: 'bg-blue-500 dark:bg-blue-400', badge: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { bar: 'bg-emerald-500 dark:bg-emerald-400', badge: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  { bar: 'bg-orange-500 dark:bg-orange-400', badge: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
  { bar: 'bg-sky-500 dark:bg-sky-400', badge: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800' },
  { bar: 'bg-rose-500 dark:bg-rose-400', badge: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
  { bar: 'bg-amber-500 dark:bg-amber-400', badge: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { bar: 'bg-teal-500 dark:bg-teal-400', badge: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
  { bar: 'bg-fuchsia-500 dark:bg-fuchsia-400', badge: 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800' },
];

function buildTagStats(resources: Resource[]): { tag: string; cost: number; count: number; resourceTypes: Record<string, number> }[] {
  const map = new Map<string, { cost: number; count: number; resourceTypes: Record<string, number> }>();

  for (const r of resources) {
    const tags: string[] = r.specs?.tags || [];
    for (const tag of tags) {
      const existing = map.get(tag) || { cost: 0, count: 0, resourceTypes: {} };
      existing.cost += r.monthly_cost || 0;
      existing.count += 1;
      existing.resourceTypes[r.resource_type] = (existing.resourceTypes[r.resource_type] || 0) + 1;
      map.set(tag, existing);
    }
  }

  return Array.from(map.entries())
    .map(([tag, stats]) => ({ tag, ...stats }))
    .sort((a, b) => b.cost - a.cost);
}

function buildRegionStats(resources: Resource[]): { region: string; count: number; cost: number; types: number }[] {
  const map = new Map<string, { count: number; cost: number; typeSet: Set<string> }>();
  for (const r of resources) {
    const region = r.region ?? 'unknown';
    const existing = map.get(region) ?? { count: 0, cost: 0, typeSet: new Set() };
    existing.count += 1;
    existing.cost += r.monthly_cost || 0;
    existing.typeSet.add(r.resource_type);
    map.set(region, existing);
  }
  return Array.from(map.entries())
    .map(([region, { count, cost, typeSet }]) => ({ region, count, cost, types: typeSet.size }))
    .sort((a, b) => b.cost - a.cost);
}

export function DashboardView({ accountId, resources, totalCost, refreshTrigger, onSectionChange, onRegionSelect }: DashboardViewProps) {
  const [tagRowsExpanded, setTagRowsExpanded] = useState(false);

  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-24">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl mb-4">
          <Activity size={40} className="text-blue-500 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2">No account selected</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-xs">Select or add a Linode account using the button in the header to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CostOverview
        accountId={accountId}
        totalCost={totalCost}
        resourceCount={resources.length}
        refreshTrigger={refreshTrigger}
      />

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Resource Summary</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">{resources.length} total resources</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {resourceTypeCards.map(({ key, label, icon: Icon, color, bgColor, borderColor }) => {
            const typeResources = resources.filter(r => r.resource_type === key);
            const count = typeResources.length;
            const cost = typeResources.reduce((sum, r) => sum + (r.monthly_cost || 0), 0);

            return (
              <button
                key={key}
                onClick={() => count > 0 && onSectionChange(key)}
                disabled={count === 0}
                className={`flex items-start gap-3 p-4 rounded-lg border transition-all text-left ${bgColor} ${borderColor} ${
                  count > 0 ? 'hover:shadow-md cursor-pointer hover:scale-[1.01]' : 'opacity-40 cursor-default'
                }`}
              >
                <div className={`p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm`}>
                  <Icon size={18} className={color} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
                  <p className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{count}</p>
                  {cost > 0 && (
                    <p className={`text-xs font-medium mt-0.5 ${color}`}>${cost.toFixed(2)}/mo</p>
                  )}
                </div>
              </button>
            );
          })}

          <div className={`flex items-start gap-3 p-4 rounded-lg border bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800`}>
            <div className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
              <DollarSign size={18} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Monthly</p>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">${totalCost.toFixed(2)}</p>
              <p className="text-xs font-medium mt-0.5 text-green-600 dark:text-green-400">per month</p>
            </div>
          </div>
        </div>
      </div>

      {(() => {
        const regionStats = buildRegionStats(resources);
        if (regionStats.length === 0) return null;
        const maxRegionCost = regionStats[0]?.cost || 1;
        return (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-blue-500 dark:text-blue-400" />
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Resources by Region</h2>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{regionStats.length} region{regionStats.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {regionStats.map(({ region, count, cost, types }) => {
                const barPct = maxRegionCost > 0 ? (cost / maxRegionCost) * 100 : 0;
                return (
                  <button
                    key={region}
                    onClick={() => onRegionSelect(region)}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin size={11} className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors flex-shrink-0" />
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 group-hover:text-blue-700 dark:group-hover:text-blue-300 truncate transition-colors">
                        {region}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{count}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">{types} type{types !== 1 ? 's' : ''}</p>
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 dark:bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    {cost > 0 && (
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-1.5">${cost.toFixed(2)}/mo</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {(() => {
        const tagStats = buildTagStats(resources);
        if (tagStats.length === 0) return null;
        const maxCost = tagStats[0]?.cost || 1;
        const VISIBLE = 6;
        const displayed = tagRowsExpanded ? tagStats : tagStats.slice(0, VISIBLE);
        const untaggedCost = resources
          .filter(r => !r.specs?.tags?.length)
          .reduce((sum, r) => sum + (r.monthly_cost || 0), 0);

        return (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-blue-500 dark:text-blue-400" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Cost by Tag</h2>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{tagStats.length} tag{tagStats.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-3">
              {displayed.map(({ tag, cost, count, resourceTypes }, i) => {
                const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
                const barPct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
                const color = TAG_COLORS[i % TAG_COLORS.length];

                return (
                  <div key={tag} className="flex items-center gap-3 group">
                    <div className="w-28 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium truncate max-w-full ${color.badge}`}>
                        <Tag size={9} />
                        <span className="truncate">{tag}</span>
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          {Object.entries(resourceTypes).map(([type, cnt]) => (
                            <span key={type} className="text-[10px] text-gray-400 dark:text-gray-500">
                              {cnt} {type.replace('_', ' ')}
                            </span>
                          ))}
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{count} resource{count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 dark:text-gray-500">{pct.toFixed(1)}%</span>
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">${cost.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${color.bar}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {untaggedCost > 0 && (
                <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                  <div className="w-28 flex-shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50">
                      <Tag size={9} />
                      <span>untagged</span>
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {resources.filter(r => !r.specs?.tags?.length).length} resources
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {totalCost > 0 ? ((untaggedCost / totalCost) * 100).toFixed(1) : '0'}%
                        </span>
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">${untaggedCost.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gray-300 dark:bg-gray-600 transition-all duration-500"
                        style={{ width: `${maxCost > 0 ? (untaggedCost / maxCost) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {tagStats.length > VISIBLE && (
              <button
                onClick={() => setTagRowsExpanded(v => !v)}
                className="mt-4 flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
              >
                {tagRowsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {tagRowsExpanded ? 'Show less' : `Show ${tagStats.length - VISIBLE} more tag${tagStats.length - VISIBLE !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown size={18} className="text-green-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Top Cost Resources</h2>
          </div>
          {resources.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No resources found</p>
          ) : (
            <div className="space-y-2">
              {[...resources]
                .sort((a, b) => (b.monthly_cost || 0) - (a.monthly_cost || 0))
                .slice(0, 8)
                .map(resource => {
                  const pct = totalCost > 0 ? ((resource.monthly_cost || 0) / totalCost) * 100 : 0;
                  return (
                    <div key={resource.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{resource.label}</span>
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">${(resource.monthly_cost || 0).toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <BudgetAlerts currentSpending={totalCost} accountId={accountId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComplianceSummaryCard
          accountId={accountId}
          refreshTrigger={refreshTrigger}
          onSectionChange={onSectionChange}
        />
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-gray-400 dark:text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Config & Compliance</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Evaluate your infrastructure against security and governance rules. Track violations, acknowledge known issues, and manage custom rules.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onSectionChange('compliance_results')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              View Results
            </button>
            <button
              onClick={() => onSectionChange('rule_manager')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              Manage Rules
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
