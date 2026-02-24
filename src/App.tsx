import { useState, useEffect, useCallback } from 'react';
import { Cloud, Sun, Moon, Monitor, LogOut, Users, ChevronDown, Shield, Zap, Eye, Check } from 'lucide-react';
import { AccountManager } from './components/AccountManager';
import { MetricsViewer } from './components/MetricsViewer';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { RegionInventoryView } from './components/RegionInventoryView';
import { ResourceTypeView } from './components/ResourceTypeView';
import { ConfigView } from './components/ConfigView';
import { RuleManagerView } from './components/config/RuleManagerView';
import { ProfilesView } from './components/config/ProfilesView';
import { ReportsView } from './components/reports/ReportsView';
import { LoginPage } from './components/auth/LoginPage';
import { UserManagementPanel } from './components/auth/UserManagementPanel';
import { getResources } from './lib/api';
import { getAccessibleAccounts } from './lib/userApi';
import type { AccessibleAccount } from './lib/userApi';
import { useAuth } from './lib/auth';
import { useTheme } from './lib/useTheme';
import type { Theme } from './lib/useTheme';
import type { NavSection } from './components/Sidebar';
import type { Resource } from './types';
import type { LinodeAccount } from './types';

const themeOptions: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

const ROLE_ICON = { admin: Shield, power_user: Zap, auditor: Eye };
const ROLE_LABEL = { admin: 'Admin', power_user: 'Power User', auditor: 'Auditor' };

function AppShell() {
  const { orgUser, signOut, isAdmin, loading } = useAuth();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [refreshRecommendations, setRefreshRecommendations] = useState(0);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedVpcId, setSelectedVpcId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [accessibleAccounts, setAccessibleAccounts] = useState<AccessibleAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const { theme, setTheme } = useTheme();

  const selectedAccount = accessibleAccounts.find(a => a.id === selectedAccountId) ?? null;
  const canViewCosts = isAdmin || !accountsLoaded || (
    selectedAccount
      ? selectedAccount.can_view_costs
      : accessibleAccounts.some(a => a.can_view_costs)
  );
  const canViewCompliance = isAdmin || !accountsLoaded || (
    selectedAccount
      ? selectedAccount.can_view_compliance
      : accessibleAccounts.some(a => a.can_view_compliance)
  );

  const costSections: NavSection[] = ['linode', 'volume', 'object_storage', 'lke_cluster', 'database', 'nodebalancer', 'firewall', 'vpc'];
  const complianceSections: NavSection[] = ['compliance_results', 'rule_manager', 'profiles', 'reports'];

  useEffect(() => {
    if (!canViewCosts && (activeSection === 'dashboard' || costSections.includes(activeSection))) {
      setActiveSection(canViewCompliance ? 'compliance_results' : 'dashboard');
    }
    if (!canViewCompliance && complianceSections.includes(activeSection)) {
      setActiveSection(canViewCosts ? 'dashboard' : 'dashboard');
    }
  }, [canViewCosts, canViewCompliance, activeSection]);

  const loadAccessibleAccounts = useCallback(async () => {
    if (!orgUser) {
      if (!loading) setAccountsLoaded(true);
      return;
    }
    try {
      const accts = await getAccessibleAccounts(orgUser.id, orgUser.role);
      setAccessibleAccounts(accts);
      setAccountsLoaded(true);
      if (selectedAccountId && !accts.find(a => a.id === selectedAccountId)) {
        setSelectedAccountId(null);
      }
    } catch {
      setAccessibleAccounts([]);
      setAccountsLoaded(true);
    }
  }, [orgUser, selectedAccountId, loading]);

  useEffect(() => {
    loadAccessibleAccounts();
  }, [orgUser, loading]);

  useEffect(() => {
    if (selectedAccountId) {
      loadResources();
    } else {
      setResources([]);
    }
  }, [selectedAccountId]);

  async function loadResources() {
    if (!selectedAccountId) return;
    try {
      const data = await getResources(selectedAccountId);
      setResources(data);
    } catch {
      setResources([]);
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-xl shadow-lg animate-pulse">
            <Cloud size={24} className="text-white" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  const totalCost = resources.reduce((sum, r) => sum + (r.monthly_cost || 0), 0);
  const RoleIcon = orgUser ? ROLE_ICON[orgUser.role] : Eye;
  const roleLabel = orgUser ? ROLE_LABEL[orgUser.role] : '';

  const isReadOnly = orgUser?.role === 'auditor';

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm z-20">
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg shadow-md">
                <Cloud size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 leading-tight">Linode Cost and Compliance Monitor</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                {themeOptions.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    title={label}
                    className={`p-1.5 rounded-md transition-colors ${
                      theme === value
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>

              {!isReadOnly && <SettingsPanel activeAccountId={selectedAccountId} />}

              {!isReadOnly && (
                <AccountManager
                  onAccountSelect={setSelectedAccountId}
                  selectedAccountId={selectedAccountId}
                  filterAccountIds={(!orgUser || isAdmin) ? undefined : accessibleAccounts.map(a => a.id)}
                  onSyncComplete={() => {
                    setSyncTrigger(prev => prev + 1);
                    loadResources();
                    loadAccessibleAccounts();
                  }}
                />
              )}

              {isReadOnly && (
                <AccountSwitcher
                  accounts={accessibleAccounts}
                  selectedAccountId={selectedAccountId}
                  onSelect={setSelectedAccountId}
                />
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserMenu(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-sm"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                      {(orgUser?.full_name || orgUser?.email || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:flex flex-col items-start leading-tight">
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 max-w-[120px] truncate">
                      {orgUser?.full_name || orgUser?.email}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <RoleIcon size={9} />
                      {roleLabel}
                    </span>
                  </div>
                  <ChevronDown size={13} className="text-gray-400 hidden sm:block" />
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-40 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {orgUser?.full_name || '—'}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{orgUser?.email}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <RoleIcon size={10} className="text-gray-500 dark:text-gray-400" />
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">{roleLabel}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => { setShowUserMenu(false); setShowUserMgmt(true); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Users size={14} className="text-gray-500 dark:text-gray-400" />
                          Manage Users
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setShowUserMenu(false); signOut(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={(section) => { setActiveSection(section); if (section !== 'vpc') setSelectedVpcId(null); setSelectedRegion(null); }}
          resources={resources}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          selectedVpcId={selectedVpcId}
          onVpcSelect={setSelectedVpcId}
          canViewCosts={canViewCosts}
          canViewCompliance={canViewCompliance}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {activeSection === 'dashboard' && selectedRegion ? (
              <RegionInventoryView
                region={selectedRegion}
                resources={resources}
                onBack={() => setSelectedRegion(null)}
              />
            ) : activeSection === 'dashboard' ? (
              <DashboardView
                accountId={selectedAccountId}
                resources={resources}
                totalCost={totalCost}
                refreshTrigger={syncTrigger}
                onSectionChange={setActiveSection}
                onRegionSelect={setSelectedRegion}
              />
            ) : activeSection === 'compliance_results' ? (
              <ConfigView
                accountId={selectedAccountId}
                syncTrigger={syncTrigger}
                onNavigateToRuleManager={() => setActiveSection('rule_manager')}
                readOnly={isReadOnly}
              />
            ) : activeSection === 'rule_manager' ? (
              selectedAccountId ? (
                <RuleManagerView accountId={selectedAccountId} />
              ) : (
                <EmptyAccountPrompt />
              )
            ) : activeSection === 'profiles' ? (
              selectedAccountId ? (
                <ProfilesView accountId={selectedAccountId} />
              ) : (
                <EmptyAccountPrompt />
              )
            ) : activeSection === 'reports' ? (
              <ReportsView accountId={selectedAccountId} />
            ) : (
              <ResourceTypeView
                section={activeSection}
                accountId={selectedAccountId}
                onResourceSelect={setSelectedResource}
                onRecommendationGenerated={() => setRefreshRecommendations(prev => prev + 1)}
                refreshTrigger={refreshRecommendations}
                syncTrigger={syncTrigger}
                selectedVpcId={selectedVpcId}
                allResources={resources}
              />
            )}
          </div>
        </main>
      </div>

      {selectedResource && (
        <MetricsViewer
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}

      {showUserMgmt && isAdmin && (
        <UserManagementPanel onClose={() => setShowUserMgmt(false)} />
      )}
    </div>
  );
}

function AccountSwitcher({ accounts, selectedAccountId, onSelect }: {
  accounts: AccessibleAccount[];
  selectedAccountId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 text-sm transition-colors"
      >
        <span className="text-xs text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
          {selected ? selected.name : 'Select account'}
        </span>
        <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-40 overflow-hidden">
            {accounts.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No accounts assigned.</p>
            ) : (
              accounts.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onSelect(a.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                    a.id === selectedAccountId
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {a.id === selectedAccountId && <Check size={13} className="flex-shrink-0" />}
                  <span className="truncate">{a.name}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyAccountPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">Select an account to continue.</p>
    </div>
  );
}

function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="p-3 bg-blue-600 rounded-xl shadow-lg animate-pulse">
          <Cloud size={24} className="text-white" />
        </div>
      </div>
    );
  }

  if (!session) return <LoginPage />;
  return <AppShell />;
}

export default App;
