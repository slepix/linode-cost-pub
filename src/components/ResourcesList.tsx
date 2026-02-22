import { useState, useEffect } from 'react';
import { Server, HardDrive, Network, Database, Globe, Shield, Activity, TrendingDown, TrendingUp, AlertCircle, AlertTriangle, X, CheckCircle, Sparkles, ChevronDown, ChevronUp, ArrowUpDown, Cpu, MemoryStick, HardDriveIcon, FolderOpen, Package, Loader2, Zap, Search, Container, CalendarDays, Waypoints } from 'lucide-react';
import { getResources, generateRecommendations, getRecommendations, dismissRecommendation, getLinodeTypesCache } from '../lib/api';
import type { Resource, Recommendation } from '../types';

interface ResourcesListProps {
  accountId: string | null;
  onResourceSelect: (resource: Resource) => void;
  onRecommendationGenerated?: () => void;
  refreshTrigger?: number;
  syncTrigger?: number;
  defaultTab?: string;
}

const resourceIcons: Record<string, any> = {
  linode: Server,
  volume: HardDrive,
  nodebalancer: Network,
  database: Database,
  lke_cluster: Container,
  domain: Globe,
  firewall: Shield,
  object_storage: Package,
  vpc: Waypoints,
};


type SortOption = 'name' | 'cost' | 'cpu' | 'ram' | 'disk';

function formatResourceAge(dateStr: string | null | undefined): { label: string; daysActive: number; daysThisMonth: number } | null {
  if (!dateStr) return null;
  const created = new Date(dateStr);
  if (isNaN(created.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const daysActive = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeStart = created > monthStart ? created : monthStart;
  const daysThisMonth = Math.max(0, Math.floor((now.getTime() - activeStart.getTime()) / (1000 * 60 * 60 * 24)));

  const years = Math.floor(daysActive / 365);
  const months = Math.floor((daysActive % 365) / 30);
  const days = daysActive % 30;

  let label = '';
  if (years > 0) label = `${years}y ${months}mo ago`;
  else if (months > 0) label = `${months}mo ${days}d ago`;
  else label = `${daysActive}d ago`;

  return { label, daysActive, daysThisMonth };
}

export function ResourcesList({ accountId, onResourceSelect, onRecommendationGenerated, refreshTrigger, syncTrigger, defaultTab }: ResourcesListProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingRec, setGeneratingRec] = useState<string | null>(null);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState(defaultTab || 'all');
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagFilterMode, setTagFilterMode] = useState<'or' | 'and'>('or');
  const [tagSearch, setTagSearch] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [expandedResourceRecs, setExpandedResourceRecs] = useState<Set<string>>(new Set());
  const [linodeTypes, setLinodeTypes] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getLinodeTypesCache().then(setLinodeTypes).catch(() => {});
  }, []);

  useEffect(() => {
    setActiveTab(defaultTab || 'all');
  }, [defaultTab]);

  useEffect(() => {
    if (accountId) {
      loadResources();
      loadRecommendations();
    } else {
      setResources([]);
      setRecommendations([]);
    }
  }, [accountId]);

  useEffect(() => {
    if (accountId) {
      loadRecommendations();
    }
  }, [refreshTrigger, accountId]);

  useEffect(() => {
    if (accountId && syncTrigger) {
      loadResources();
    }
  }, [syncTrigger]);

  async function loadResources() {
    if (!accountId) return;

    setLoading(true);
    try {
      const data = await getResources(accountId);
      setResources(data);
    } catch (error) {
      console.error('Failed to load resources:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecommendations() {
    if (!accountId) {
      setRecommendations([]);
      return;
    }

    setLoadingRecs(true);
    try {
      const data = await getRecommendations('active', accountId);
      setRecommendations(data);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoadingRecs(false);
    }
  }

  async function handleDismissRecommendation(id: string) {
    try {
      await dismissRecommendation(id);
      await loadRecommendations();
    } catch (error) {
      console.error('Failed to dismiss recommendation:', error);
    }
  }

  async function handleGenerateRecommendation(resourceId: string) {
    setGeneratingRec(resourceId);
    try {
      await generateRecommendations(resourceId);
      onRecommendationGenerated?.();
    } catch (error) {
      console.error('Failed to generate recommendation:', error);
      alert(`Failed to generate recommendation: ${error.message}`);
    } finally {
      setGeneratingRec(null);
    }
  }

  async function handleAnalyzeAll() {
    const filteredResources = activeTab === 'all'
      ? resources.filter(r => r.resource_type === 'linode')
      : resources.filter(r => r.resource_type === activeTab && r.resource_type === 'linode');

    if (filteredResources.length === 0) {
      alert('No analyzable instances found in this tab');
      return;
    }

    setAnalyzingAll(true);
    setAnalyzeProgress({ current: 0, total: filteredResources.length });
    let successCount = 0;
    const batchSize = 10;

    for (let i = 0; i < filteredResources.length; i += batchSize) {
      const batch = filteredResources.slice(i, i + batchSize);
      setAnalyzeProgress({ current: Math.min(i + batchSize, filteredResources.length), total: filteredResources.length });
      const results = await Promise.allSettled(
        batch.map((resource) => generateRecommendations(resource.id))
      );
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          console.error(`Failed to analyze ${batch[idx].label}:`, result.reason);
        }
      });
    }

    setAnalyzingAll(false);
    setAnalyzeProgress(null);

    if (successCount > 0) {
      onRecommendationGenerated?.();
    }
  }

  function getStatusColor(status?: string) {
    switch (status?.toLowerCase()) {
      case 'running':
        return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300';
      case 'stopped':
        return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300';
      case 'offline':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      case 'unmounted':
        return 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300';
      default:
        return 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300';
    }
  }

  function isVolumeUnmounted(resource: Resource): boolean {
    return resource.resource_type === 'volume' && !resource.specs?.linode_id;
  }

  function getResourceStatus(resource: Resource): string {
    if (isVolumeUnmounted(resource)) {
      return 'unmounted';
    }
    return resource.status || 'active';
  }

  function getRecommendationIcon(type: string) {
    switch (type) {
      case 'downsize':
        return <TrendingDown className="text-green-600 dark:text-green-400" size={20} />;
      case 'upgrade':
        return <TrendingUp className="text-orange-600 dark:text-orange-400" size={20} />;
      case 'optimize':
        return <AlertCircle className="text-blue-600 dark:text-blue-400" size={20} />;
      default:
        return <CheckCircle className="text-gray-600 dark:text-gray-400" size={20} />;
    }
  }

  function getRecommendationColor(type: string) {
    switch (type) {
      case 'downsize':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20';
      case 'upgrade':
        return 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20';
      case 'optimize':
        return 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20';
      case 'delete_unused':
        return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20';
      default:
        return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50';
    }
  }

  function renderSpecChanges(rec: Recommendation) {
    if (!rec.current_plan || !rec.suggested_plan) return null;
    const current = linodeTypes[rec.current_plan];
    const suggested = linodeTypes[rec.suggested_plan];
    if (!current || !suggested) return null;

    const changes: { label: string; from: string; to: string; better: boolean }[] = [];

    if (current.vcpus !== suggested.vcpus) {
      changes.push({
        label: 'CPU',
        from: `${current.vcpus} core${current.vcpus !== 1 ? 's' : ''}`,
        to: `${suggested.vcpus} core${suggested.vcpus !== 1 ? 's' : ''}`,
        better: suggested.vcpus < current.vcpus ? rec.recommendation_type === 'downsize' : true,
      });
    }
    if (current.memory !== suggested.memory) {
      changes.push({
        label: 'RAM',
        from: `${current.memory / 1024} GB`,
        to: `${suggested.memory / 1024} GB`,
        better: suggested.memory < current.memory ? rec.recommendation_type === 'downsize' : true,
      });
    }
    if (current.disk !== suggested.disk) {
      changes.push({
        label: 'Disk',
        from: `${current.disk / 1024} GB`,
        to: `${suggested.disk / 1024} GB`,
        better: suggested.disk < current.disk ? rec.recommendation_type === 'downsize' : true,
      });
    }

    if (changes.length === 0) return null;

    return (
      <div className="mt-1.5 flex flex-wrap gap-2">
        {changes.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-500 dark:text-gray-400">{c.label}</span>
            <span className="text-gray-400 dark:text-gray-500 line-through">{c.from}</span>
            <span className="text-gray-400 dark:text-gray-500">→</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100">{c.to}</span>
          </span>
        ))}
      </div>
    );
  }

  const allTags = Array.from(
    new Set(
      resources.flatMap(r => r.specs?.tags || [])
    )
  ).sort();

  let filteredResources = activeTab === 'all'
    ? resources
    : resources.filter(r => r.resource_type === activeTab);

  if (selectedTags.size > 0) {
    filteredResources = filteredResources.filter(r =>
      tagFilterMode === 'and'
        ? [...selectedTags].every(tag => r.specs?.tags?.includes(tag))
        : [...selectedTags].some(tag => r.specs?.tags?.includes(tag))
    );
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filteredResources = filteredResources.filter(r => {
      return (
        r.label?.toLowerCase().includes(q) ||
        r.resource_type?.toLowerCase().includes(q) ||
        r.region?.toLowerCase().includes(q) ||
        r.plan_type?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q) ||
        r.specs?.tags?.some((t: string) => t.toLowerCase().includes(q)) ||
        String(r.monthly_cost || '').includes(q) ||
        String(r.specs?.vcpus || '').includes(q) ||
        String(r.specs?.memory || '').includes(q) ||
        String(r.specs?.disk || '').includes(q)
      );
    });
  }

  const sortedResources = [...filteredResources].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.label.localeCompare(b.label);
      case 'cost':
        return (b.monthly_cost || 0) - (a.monthly_cost || 0);
      case 'cpu':
        return (b.specs?.vcpus || 0) - (a.specs?.vcpus || 0);
      case 'ram':
        return (b.specs?.memory || 0) - (a.specs?.memory || 0);
      case 'disk':
        return (b.specs?.disk || b.specs?.size || 0) - (a.specs?.disk || a.specs?.size || 0);
      default:
        return 0;
    }
  });

  if (!accountId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">Select an account to view resources</p>
      </div>
    );
  }

  const canAnalyze = activeTab === 'all'
    ? resources.some(r => r.resource_type === 'linode')
    : activeTab === 'linode' && filteredResources.length > 0;

  const totalSavings = recommendations.reduce((sum, rec) => sum + (rec.potential_savings || 0), 0);

  const getResourceRecommendations = (resourceId: string) => {
    return recommendations.filter(rec => rec.resource_id === resourceId);
  };

  const toggleResourceRecs = (resourceId: string) => {
    const newExpanded = new Set(expandedResourceRecs);
    if (newExpanded.has(resourceId)) {
      newExpanded.delete(resourceId);
    } else {
      newExpanded.add(resourceId);
    }
    setExpandedResourceRecs(newExpanded);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Resources</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecommendations(!showRecommendations)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              showRecommendations
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Sparkles size={16} />
            <span>AI Insights</span>
            {recommendations.length > 0 && !showRecommendations && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {recommendations.length}
              </span>
            )}
            {showRecommendations ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {canAnalyze && (
            <button
              onClick={handleAnalyzeAll}
              disabled={analyzingAll || !accountId}
              className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all disabled:cursor-not-allowed shadow-md overflow-hidden min-w-[130px]"
            >
              {analyzeProgress && (
                <span
                  className="absolute inset-0 bg-white/20 transition-all duration-300 ease-out"
                  style={{ width: `${(analyzeProgress.current / analyzeProgress.total) * 100}%` }}
                />
              )}
              <span className="relative flex items-center gap-2 w-full justify-center">
                {analyzingAll ? <Loader2 size={16} className="animate-spin flex-shrink-0" /> : <Activity size={16} className="flex-shrink-0" />}
                {analyzeProgress
                  ? <span className="tabular-nums">{Math.round((analyzeProgress.current / analyzeProgress.total) * 100)}%</span>
                  : 'Analyze All'}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, type, region, instance type, tag..."
          className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Filter by tag:</label>
              {selectedTags.size > 1 && (
                <div className="flex items-center rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-xs font-medium">
                  <button
                    onClick={() => setTagFilterMode('or')}
                    className={`px-2.5 py-1 transition-colors ${tagFilterMode === 'or' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                  >
                    ANY
                  </button>
                  <button
                    onClick={() => setTagFilterMode('and')}
                    className={`px-2.5 py-1 transition-colors border-l border-gray-300 dark:border-gray-600 ${tagFilterMode === 'and' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                  >
                    ALL
                  </button>
                </div>
              )}
              {selectedTags.size > 0 && (
                <button
                  onClick={() => setSelectedTags(new Set())}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>
            {selectedTags.size > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Tag cost:</span>
                <span className="text-sm font-bold text-blue-800 dark:text-blue-200">
                  ${filteredResources.reduce((sum, r) => sum + (r.monthly_cost || 0), 0).toFixed(2)}
                  <span className="text-xs font-normal text-blue-600 dark:text-blue-400">/mo</span>
                </span>
              </div>
            )}
          </div>
          {(() => {
            const TAG_LIMIT = 25;
            const visibleTags = allTags.slice(0, TAG_LIMIT);
            const remainingTags = allTags.slice(TAG_LIMIT);
            const filteredDropdownTags = remainingTags.filter(t =>
              t.toLowerCase().includes(tagSearch.toLowerCase())
            );

            const toggleTag = (tag: string) => {
              setSelectedTags(prev => {
                const next = new Set(prev);
                if (next.has(tag)) next.delete(tag);
                else next.add(tag);
                return next;
              });
            };

            return (
              <div className="flex flex-wrap gap-2 items-center">
                {visibleTags.map((tag) => {
                  const isSelected = selectedTags.has(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {tag}
                      {isSelected && <X size={11} />}
                    </button>
                  );
                })}

                {remainingTags.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setTagDropdownOpen(o => !o)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        tagDropdownOpen
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      +{remainingTags.length} more
                      <ChevronDown size={11} className={`transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {tagDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => { setTagDropdownOpen(false); setTagSearch(''); }}
                        />
                        <div className="absolute left-0 top-full mt-1.5 z-20 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <Search size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
                              <input
                                autoFocus
                                type="text"
                                placeholder="Search tags..."
                                value={tagSearch}
                                onChange={e => setTagSearch(e.target.value)}
                                className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                              />
                              {tagSearch && (
                                <button onClick={() => setTagSearch('')}>
                                  <X size={11} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto py-1">
                            {filteredDropdownTags.length === 0 ? (
                              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">No tags found</p>
                            ) : (
                              filteredDropdownTags.map(tag => {
                                const isSelected = selectedTags.has(tag);
                                return (
                                  <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                                      isSelected
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                  >
                                    <span>{tag}</span>
                                    {isSelected && <X size={11} />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {filteredResources.length > 0 && (() => {
        const allSortOptions: { key: SortOption; label: string; icon?: any; types: string[] }[] = [
          { key: 'name', label: 'Name', types: ['all', 'linode', 'volume', 'nodebalancer', 'database', 'lke_cluster', 'domain', 'firewall', 'object_storage', 'vpc'] },
          { key: 'cost', label: 'Cost', types: ['all', 'linode', 'volume', 'nodebalancer', 'database', 'lke_cluster', 'object_storage'] },
          { key: 'cpu', label: 'CPU', icon: Cpu, types: ['linode', 'database'] },
          { key: 'ram', label: 'RAM', icon: MemoryStick, types: ['linode', 'database'] },
          { key: 'disk', label: 'Disk', icon: HardDriveIcon, types: ['linode', 'volume', 'database', 'object_storage'] },
        ];
        const availableOptions = allSortOptions.filter(o => o.types.includes(activeTab));
        if (!availableOptions.find(o => o.key === sortBy)) setSortBy('name');
        return (
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <ArrowUpDown size={14} className="text-gray-400 dark:text-gray-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Sort by:</span>
            <div className="flex gap-1">
              {availableOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSortBy(option.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                    sortBy === option.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {option.icon && <option.icon size={12} />}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {showRecommendations && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="text-blue-600 dark:text-blue-400" size={20} />
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">AI Recommendations</h3>
              {totalSavings > 0 && (
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                  Save ${totalSavings.toFixed(2)}/month
                </span>
              )}
            </div>
            <button
              onClick={loadRecommendations}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              Refresh
            </button>
          </div>

          {loadingRecs ? (
            <div className="text-center py-6">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Loading recommendations...</p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle size={40} className="mx-auto text-green-500 mb-2" />
              <p className="text-gray-600 dark:text-gray-300">No active recommendations</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Generate AI recommendations by analyzing your resources
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-4 border-2 rounded-lg ${getRecommendationColor(rec.recommendation_type)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">{getRecommendationIcon(rec.recommendation_type)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                            {rec.title || rec.recommendation_type}
                          </h4>
                          <span className="px-2 py-1 text-xs font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                            {rec.confidence_score}% confidence
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(rec.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        {rec.resources && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            Resource: {rec.resources.label}
                          </p>
                        )}
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{rec.reasoning}</p>
                        {rec.note && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1.5 mt-2">{rec.note}</p>
                        )}
                        {rec.current_plan && rec.suggested_plan && rec.current_plan !== rec.suggested_plan && (
                          <div className="mt-2 text-sm">
                            <span className="text-gray-600 dark:text-gray-300">Change from </span>
                            <span className="font-medium text-gray-800 dark:text-gray-100">{rec.current_plan}</span>
                            <span className="text-gray-600 dark:text-gray-300"> to </span>
                            <span className="font-medium text-gray-800 dark:text-gray-100">{rec.suggested_plan}</span>
                          </div>
                        )}
                        {renderSpecChanges(rec)}
                        {rec.potential_savings > 0 && (
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400 mt-2">
                            Save ${rec.potential_savings.toFixed(2)}/month
                          </p>
                        )}
                        {rec.estimated_cost_increase > 0 && (
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 mt-2">
                            Additional cost: ${rec.estimated_cost_increase.toFixed(2)}/month
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDismissRecommendation(rec.id)}
                      className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                      title="Dismiss"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-300">Loading resources...</p>
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            {resources.length === 0
              ? 'No resources found. Try syncing the account.'
              : searchQuery
              ? `No resources match "${searchQuery}".`
              : 'No resources found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedResources.map((resource) => {
            const Icon = resourceIcons[resource.resource_type] || Server;
            const isUnmounted = isVolumeUnmounted(resource);
            const displayStatus = getResourceStatus(resource);
            const isLinode = resource.resource_type === 'linode';
            const hasSpecs = isLinode && resource.specs;
            const gpuCount = isLinode ? (resource.specs?.gpus || 0) : 0;
            const resourceRecs = getResourceRecommendations(resource.id);
            const hasRecs = resourceRecs.length > 0;
            const isExpanded = expandedResourceRecs.has(resource.id);
            const resourceAge = formatResourceAge(resource.resource_created_at);

            return (
              <div
                key={resource.id}
                className={`border rounded-lg transition-all ${
                  isUnmounted
                    ? 'border-orange-300 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-900/10'
                    : hasRecs
                    ? 'border-green-300 dark:border-green-700 bg-green-50/20 dark:bg-green-900/10'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div
                  className={`p-2.5 transition-all ${['volume', 'object_storage', 'lke_cluster', 'database', 'firewall', 'domain', 'vpc'].includes(resource.resource_type) ? 'cursor-default' : 'hover:shadow-md cursor-pointer'}`}
                  onClick={() => !['volume', 'object_storage', 'lke_cluster', 'database', 'firewall', 'domain', 'vpc'].includes(resource.resource_type) && onResourceSelect(resource)}
                >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`p-1.5 rounded ${isUnmounted ? 'bg-orange-100 dark:bg-orange-900/40' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                      <Icon size={16} className={isUnmounted ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{resource.label}</h3>
                        {isUnmounted && (
                          <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[10px] rounded font-medium whitespace-nowrap">
                            Review
                          </span>
                        )}
                        {gpuCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-[10px] rounded font-semibold whitespace-nowrap">
                            <Zap size={9} className="fill-amber-500 text-amber-500" />
                            {gpuCount} GPU{gpuCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="capitalize">{resource.resource_type.replace('_', ' ')}</span>
                        {resource.region && <span>·</span>}
                        {resource.region && <span className="truncate">{resource.region}</span>}
                        {resource.plan_type && <span>·</span>}
                        {resource.plan_type && <span className="truncate">{resource.plan_type}</span>}
                        {resource.resource_type === 'volume' && resource.specs?.size && <span>·</span>}
                        {resource.resource_type === 'volume' && resource.specs?.size && (
                          <span>{resource.specs.size} GB</span>
                        )}
                        {resource.resource_type === 'object_storage' && resource.specs?.endpoint_type && <span>·</span>}
                        {resource.resource_type === 'object_storage' && resource.specs?.endpoint_type && (
                          <span>{resource.specs.endpoint_type}</span>
                        )}
                        {resourceAge && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays size={10} className="text-gray-400 dark:text-gray-500" />
                              {resourceAge.label}
                            </span>
                          </>
                        )}
                      </div>
                      {resourceAge && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                          <span>Active {resourceAge.daysThisMonth}d this month</span>
                        </div>
                      )}
                      {hasSpecs && (
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          {resource.specs.vcpus && (
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              <Cpu size={11} className="text-blue-600 dark:text-blue-400" />
                              <span className="font-medium">{resource.specs.vcpus}</span>
                            </div>
                          )}
                          {resource.specs.memory && (
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              <MemoryStick size={11} className="text-green-600 dark:text-green-400" />
                              <span className="font-medium">{resource.specs.memory / 1024} GB</span>
                            </div>
                          )}
                          {resource.specs.disk && (
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              <HardDriveIcon size={11} className="text-orange-600 dark:text-orange-400" />
                              <span className="font-medium">{resource.specs.disk / 1024} GB</span>
                            </div>
                          )}
                        </div>
                      )}
                      {resource.resource_type === 'object_storage' && resource.specs && (
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          {resource.specs.size !== undefined && (
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              <HardDriveIcon size={11} className="text-purple-600 dark:text-purple-400" />
                              <span className="font-medium">{resource.specs.size.toFixed(2)} GB</span>
                            </div>
                          )}
                          {resource.specs.objects !== undefined && (
                            <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                              <FolderOpen size={11} className="text-blue-600 dark:text-blue-400" />
                              <span className="font-medium">{resource.specs.objects.toLocaleString()} objects</span>
                            </div>
                          )}
                        </div>
                      )}
                      {resource.specs?.tags && resource.specs.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {resource.specs.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {resource.resource_type === 'nodebalancer' && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {resource.specs?.node_count !== undefined && (
                            resource.specs.node_count === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
                                <AlertTriangle size={10} />
                                No nodes — load balancer inactive
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                <Network size={10} />
                                {resource.specs.node_count} node{resource.specs.node_count !== 1 ? 's' : ''}
                              </span>
                            )
                          )}
                          {resource.specs?.ipv4 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              {resource.specs.ipv4}
                            </span>
                          )}
                        </div>
                      )}
                      {resource.resource_type === 'lke_cluster' && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {resource.specs?.k8s_version && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700">
                              <Container size={10} />
                              k8s {resource.specs.k8s_version}
                            </span>
                          )}
                          {resource.specs?.node_count !== undefined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              <Server size={10} />
                              {resource.specs.node_count} node{resource.specs.node_count !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs?.pool_count !== undefined && resource.specs.pool_count > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              {resource.specs.pool_count} pool{resource.specs.pool_count !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs?.high_availability && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                              HA
                            </span>
                          )}
                          {resource.specs?.tier && resource.specs.tier !== 'standard' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                              {resource.specs.tier}
                            </span>
                          )}
                        </div>
                      )}
                      {resource.resource_type === 'database' && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {resource.specs?.engine && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                              <Database size={10} />
                              {resource.specs.engine}
                              {resource.specs.version ? ` ${resource.specs.version}` : ''}
                            </span>
                          )}
                          {resource.specs?.cluster_size !== undefined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              <Server size={10} />
                              {resource.specs.cluster_size} node{resource.specs.cluster_size !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs?.total_disk_size_gb !== undefined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              <HardDriveIcon size={10} />
                              {resource.specs.used_disk_size_gb ?? 0} / {resource.specs.total_disk_size_gb} GB
                            </span>
                          )}
                          {resource.specs?.encrypted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                              Encrypted
                            </span>
                          )}
                          {resource.specs?.port !== undefined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                              :{resource.specs.port}
                            </span>
                          )}
                        </div>
                      )}
                      {resource.resource_type === 'firewall' && resource.specs && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${resource.specs.inbound_policy === 'DROP' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700'}`}>
                            <TrendingDown size={10} />
                            In: {resource.specs.inbound_policy}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${resource.specs.outbound_policy === 'DROP' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700'}`}>
                            <TrendingUp size={10} />
                            Out: {resource.specs.outbound_policy}
                          </span>
                          {resource.specs.inbound_rules > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              {resource.specs.inbound_rules} inbound rule{resource.specs.inbound_rules !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs.outbound_rules > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                              {resource.specs.outbound_rules} outbound rule{resource.specs.outbound_rules !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs.entity_count > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                              <Server size={10} />
                              {resource.specs.entity_count} Linode{resource.specs.entity_count !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs.entity_count === 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                              <AlertTriangle size={10} />
                              Not attached
                            </span>
                          )}
                        </div>
                      )}
                      {resource.resource_type === 'vpc' && resource.specs && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700">
                            <Waypoints size={10} />
                            {resource.specs.subnet_count} subnet{resource.specs.subnet_count !== 1 ? 's' : ''}
                          </span>
                          {resource.specs.linode_count > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                              <Server size={10} />
                              {resource.specs.linode_count} Linode{resource.specs.linode_count !== 1 ? 's' : ''}
                            </span>
                          )}
                          {resource.specs.linode_count === 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                              No instances attached
                            </span>
                          )}
                          {resource.specs.description && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{resource.specs.description}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getStatusColor(displayStatus)}`}
                    >
                      {displayStatus}
                    </span>
                    <div className="text-right">
                      {(resource.resource_type === 'firewall' || resource.resource_type === 'vpc') ? (
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">Free</p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">
                            ${resource.monthly_cost?.toFixed(2) || '0.00'}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">per month</p>
                        </>
                      )}
                    </div>
                    {hasRecs && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleResourceRecs(resource.id);
                        }}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors whitespace-nowrap"
                      >
                        <Sparkles size={10} />
                        {resourceRecs.length} {isExpanded ? 'Hide' : 'Show'}
                      </button>
                    )}
                    {isLinode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateRecommendation(resource.id);
                        }}
                        disabled={generatingRec === resource.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {generatingRec === resource.id ? <Loader2 size={10} className="animate-spin" /> : <Activity size={10} />}
                        {generatingRec === resource.id ? 'Analyzing...' : 'AI Analyze'}
                      </button>
                    )}
                  </div>
                </div>
                </div>

                {isExpanded && hasRecs && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10">
                    <div className="space-y-2">
                      {resourceRecs.map((rec) => (
                        <div
                          key={rec.id}
                          className={`p-3 border-2 rounded-lg ${getRecommendationColor(rec.recommendation_type)}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-2 flex-1">
                              <div className="mt-0.5">{getRecommendationIcon(rec.recommendation_type)}</div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                                    {rec.title || rec.recommendation_type}
                                  </h4>
                                  <span className="px-2 py-0.5 text-xs font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                                    {rec.confidence_score}% confidence
                                  </span>
                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                    {new Date(rec.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{rec.reasoning}</p>
                                {rec.note && (
                                  <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 mt-1">{rec.note}</p>
                                )}
                                {rec.current_plan && rec.suggested_plan && rec.current_plan !== rec.suggested_plan && (
                                  <div className="mt-1.5 text-xs">
                                    <span className="text-gray-600 dark:text-gray-300">Change from </span>
                                    <span className="font-medium text-gray-800 dark:text-gray-100">{rec.current_plan}</span>
                                    <span className="text-gray-600 dark:text-gray-300"> to </span>
                                    <span className="font-medium text-gray-800 dark:text-gray-100">{rec.suggested_plan}</span>
                                  </div>
                                )}
                                {renderSpecChanges(rec)}
                                {rec.potential_savings > 0 && (
                                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 mt-1.5">
                                    Save ${rec.potential_savings.toFixed(2)}/month
                                  </p>
                                )}
                                {rec.estimated_cost_increase > 0 && (
                                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mt-1.5">
                                    Additional cost: ${rec.estimated_cost_increase.toFixed(2)}/month
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDismissRecommendation(rec.id);
                              }}
                              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                              title="Dismiss"
                            >
                              <X size={14} />
                            </button>
                          </div>
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
  );
}
