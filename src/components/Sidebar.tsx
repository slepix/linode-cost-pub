import { useState } from 'react';
import {
  LayoutDashboard, Server, HardDrive, Package, Container, Database,
  Network, Shield, Globe, ChevronLeft, ChevronRight, ShieldCheck,
  Waypoints, ChevronDown, ChevronUp, ListChecks, ClipboardList, DollarSign,
  BarChart3, Layers,
} from 'lucide-react';
import type { Resource } from '../types';

export type NavSection =
  | 'dashboard'
  | 'linode'
  | 'volume'
  | 'object_storage'
  | 'lke_cluster'
  | 'database'
  | 'nodebalancer'
  | 'firewall'
  | 'vpc'
  | 'compliance_results'
  | 'rule_manager'
  | 'profiles'
  | 'reports';

interface SidebarProps {
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  resources: Resource[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  selectedVpcId: string | null;
  onVpcSelect: (vpcId: string | null) => void;
  canViewCosts: boolean;
  canViewCompliance: boolean;
}

const resourceNavItems = [
  { key: 'linode' as NavSection, label: 'Virtual Machines', icon: Server, resourceType: 'linode' },
  { key: 'volume' as NavSection, label: 'Block Storage', icon: HardDrive, resourceType: 'volume' },
  { key: 'object_storage' as NavSection, label: 'Object Storage', icon: Package, resourceType: 'object_storage' },
  { key: 'lke_cluster' as NavSection, label: 'Kubernetes', icon: Container, resourceType: 'lke_cluster' },
  { key: 'database' as NavSection, label: 'Databases', icon: Database, resourceType: 'database' },
  { key: 'nodebalancer' as NavSection, label: 'Load Balancers', icon: Network, resourceType: 'nodebalancer' },
  { key: 'firewall' as NavSection, label: 'Firewalls', icon: Shield, resourceType: 'firewall' },
  { key: 'vpc' as NavSection, label: 'VPC', icon: Waypoints, resourceType: 'vpc' },
];

const complianceNavItems = [
  { key: 'compliance_results' as NavSection, label: 'Results', icon: ClipboardList },
  { key: 'rule_manager' as NavSection, label: 'Rule Manager', icon: ListChecks },
  { key: 'profiles' as NavSection, label: 'Profiles', icon: Layers },
  { key: 'reports' as NavSection, label: 'Reports', icon: BarChart3 },
];

interface CollapsibleSectionLabelProps {
  icon: typeof Shield;
  label: string;
  sidebarCollapsed: boolean;
  sectionCollapsed: boolean;
  onToggle: () => void;
}

function CollapsibleSectionLabel({ icon: Icon, label, sidebarCollapsed, sectionCollapsed, onToggle }: CollapsibleSectionLabelProps) {
  if (sidebarCollapsed) return <div className="my-2 mx-2 border-t border-gray-100 dark:border-gray-800" />;
  return (
    <div className="mt-4 mb-1 mx-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
      >
        <Icon size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 truncate text-left">
          {label}
        </span>
        <ChevronDown
          size={13}
          className={`text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform duration-200 ${sectionCollapsed ? '-rotate-90' : ''}`}
        />
      </button>
    </div>
  );
}

export function Sidebar({ activeSection, onSectionChange, resources, collapsed, onCollapsedChange, selectedVpcId, onVpcSelect, canViewCosts, canViewCompliance }: SidebarProps) {
  const [vpcExpanded, setVpcExpanded] = useState(false);
  const [costCollapsed, setCostCollapsed] = useState(false);
  const [complianceCollapsed, setComplianceCollapsed] = useState(false);

  const vpcs = resources.filter(r => r.resource_type === 'vpc');

  function getCount(resourceType: string): number {
    return resources.filter(r => r.resource_type === resourceType).length;
  }

  function getCost(resourceType: string): number {
    return resources
      .filter(r => r.resource_type === resourceType)
      .reduce((sum, r) => sum + (r.monthly_cost || 0), 0);
  }

  function navItemClass(isActive: boolean, hasResources: boolean, isSubItem = false) {
    const base = `w-full flex items-center gap-3 rounded-lg text-left transition-all group ${isSubItem && !collapsed ? 'px-3 py-2' : 'px-3 py-2.5'}`;
    if (isActive) return `${base} bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`;
    if (hasResources) return `${base} text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800`;
    return `${base} text-gray-400 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-default`;
  }

  function iconClass(isActive: boolean, hasResources: boolean) {
    if (isActive) return 'text-blue-600 dark:text-blue-400';
    if (hasResources) return 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200';
    return 'text-gray-300 dark:text-gray-600';
  }

  const isDashboardActive = activeSection === 'dashboard';
  const totalCost = resources.reduce((s, r) => s + (r.monthly_cost || 0), 0);

  return (
    <aside
      className={`relative flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out flex-shrink-0 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <button
        onClick={() => onCollapsedChange(!collapsed)}
        className="absolute -right-3 top-6 z-10 flex items-center justify-center w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-0.5 px-2">

          {/* Dashboard */}
          <li>
            <button
              onClick={() => { onSectionChange('dashboard'); onVpcSelect(null); }}
              title={collapsed ? 'Dashboard' : undefined}
              className={navItemClass(isDashboardActive, true)}
            >
              <LayoutDashboard size={18} className={`flex-shrink-0 ${iconClass(isDashboardActive, true)}`} />
              {!collapsed && (
                <span className="text-sm font-medium truncate">Dashboard</span>
              )}
            </button>
          </li>

          {/* ── Cost Management section ── */}
          {canViewCosts && (
            <CollapsibleSectionLabel
              icon={DollarSign}
              label="Cost Management"
              sidebarCollapsed={collapsed}
              sectionCollapsed={costCollapsed}
              onToggle={() => setCostCollapsed(v => !v)}
            />
          )}

          {/* Resource items */}
          {canViewCosts && !costCollapsed && resourceNavItems.map(({ key, label, icon: Icon, resourceType }) => {
            const isVpc = key === 'vpc';
            const isActiveAny = activeSection === key;
            const count = getCount(resourceType);
            const cost = getCost(resourceType);
            const hasResources = count > 0;

            return (
              <li key={key}>
                <button
                  onClick={() => { onSectionChange(key); if (isVpc) onVpcSelect(null); else onVpcSelect(null); }}
                  title={collapsed ? label : undefined}
                  className={navItemClass(isActiveAny && !selectedVpcId, hasResources)}
                >
                  <Icon
                    size={18}
                    className={`flex-shrink-0 ${iconClass(isActiveAny && !selectedVpcId, hasResources)}`}
                  />
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-sm font-medium truncate ${isActiveAny && !selectedVpcId ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                          {label}
                        </span>
                        <div className="flex items-center gap-1">
                          {count > 0 && (
                            <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              isActiveAny && !selectedVpcId
                                ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }`}>
                              {count}
                            </span>
                          )}
                          {isVpc && vpcs.length > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setVpcExpanded(v => !v); }}
                              className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              {vpcExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                          )}
                        </div>
                      </div>
                      {cost > 0 && (
                        <p className={`text-[10px] mt-0.5 ${isActiveAny && !selectedVpcId ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          ${cost.toFixed(2)}/mo
                        </p>
                      )}
                    </div>
                  )}
                </button>

                {isVpc && !collapsed && vpcExpanded && vpcs.length > 0 && (
                  <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-gray-200 dark:border-gray-700 pl-2">
                    {vpcs.map((vpc) => {
                      const isVpcActive = activeSection === 'vpc' && selectedVpcId === vpc.id;
                      const subnetCount: number = vpc.specs?.subnet_count ?? 0;
                      return (
                        <li key={vpc.id}>
                          <button
                            onClick={() => { onSectionChange('vpc'); onVpcSelect(vpc.id); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all text-xs ${
                              isVpcActive
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                          >
                            <Waypoints size={12} className={`flex-shrink-0 ${isVpcActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                            <span className="truncate font-medium">{vpc.label}</span>
                            {subnetCount > 0 && (
                              <span className={`ml-auto flex-shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded-full ${
                                isVpcActive
                                  ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                              }`}>
                                {subnetCount}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}

          {/* ── Config & Compliance section ── */}
          {canViewCompliance && (
            <CollapsibleSectionLabel
              icon={ShieldCheck}
              label="Config & Compliance"
              sidebarCollapsed={collapsed}
              sectionCollapsed={complianceCollapsed}
              onToggle={() => setComplianceCollapsed(v => !v)}
            />
          )}

          {canViewCompliance && !complianceCollapsed && complianceNavItems.map(({ key, label, icon: Icon }) => {
            const isActive = activeSection === key;
            return (
              <li key={key}>
                <button
                  onClick={() => onSectionChange(key)}
                  title={collapsed ? label : undefined}
                  className={navItemClass(isActive, true)}
                >
                  <Icon size={18} className={`flex-shrink-0 ${iconClass(isActive, true)}`} />
                  {!collapsed && (
                    <span className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                      {label}
                    </span>
                  )}
                </button>
              </li>
            );
          })}

        </ul>
      </nav>

      {!collapsed && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <div className="flex items-center gap-1">
              <Globe size={11} />
              <span>{resources.length} resources</span>
            </div>
            {canViewCosts && <span>${totalCost.toFixed(2)}/mo</span>}
          </div>
        </div>
      )}
    </aside>
  );
}
