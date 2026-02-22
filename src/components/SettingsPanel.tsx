import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, TrendingDown, Scale, Zap, X, FileText, RotateCcw, ChevronDown, Loader } from 'lucide-react';
import { getAIConfig, saveAIConfig, refreshLinodeTypes, getProfilePrompt, saveProfilePrompt } from '../lib/api';
import { buildDefaultPromptTemplate } from '../lib/prompts';
import type { SavingsProfile } from '../types';
import { SAVINGS_PROFILE_LABELS } from '../types';

interface SettingsPanelProps {
  activeAccountId: string | null;
}

const profileIcons = {
  relaxed: Scale,
  balanced: TrendingDown,
  aggressive: Zap,
};

const profileColors: Record<SavingsProfile, { active: string; hover: string; border: string; icon: string }> = {
  relaxed: {
    active: 'bg-blue-600 text-white border-blue-600',
    hover: 'hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
    border: 'border-gray-200 dark:border-gray-600',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  balanced: {
    active: 'bg-green-600 text-white border-green-600',
    hover: 'hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
    border: 'border-gray-200 dark:border-gray-600',
    icon: 'text-green-600 dark:text-green-400',
  },
  aggressive: {
    active: 'bg-orange-600 text-white border-orange-600',
    hover: 'hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20',
    border: 'border-gray-200 dark:border-gray-600',
    icon: 'text-orange-600 dark:text-orange-400',
  },
};

const promptEditColors: Record<SavingsProfile, { btn: string; ring: string; badge: string }> = {
  relaxed: {
    btn: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-700',
    ring: 'focus:ring-blue-500',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  },
  balanced: {
    btn: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 border-green-200 dark:border-green-700',
    ring: 'focus:ring-green-500',
    badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  },
  aggressive: {
    btn: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40 border-orange-200 dark:border-orange-700',
    ring: 'focus:ring-orange-500',
    badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  },
};

interface PromptEditorState {
  profile: SavingsProfile;
  value: string;
  isCustom: boolean;
  saving: boolean;
}

export function SettingsPanel({ activeAccountId }: SettingsPanelProps) {
  const [show, setShow] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gpt-4');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [savingsProfile, setSavingsProfile] = useState<SavingsProfile>('balanced');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshingTypes, setRefreshingTypes] = useState(false);
  const [typesRefreshed, setTypesRefreshed] = useState<number | null>(null);
  const [promptEditor, setPromptEditor] = useState<PromptEditorState | null>(null);
  const [customPromptFlags, setCustomPromptFlags] = useState<Record<SavingsProfile, boolean>>({
    relaxed: false,
    balanced: false,
    aggressive: false,
  });

  useEffect(() => {
    loadConfig();
    loadCustomPromptFlags();
  }, []);

  function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  async function loadConfig() {
    try {
      const config = await getAIConfig();
      if (config) {
        const base = config.api_endpoint.replace(/\/v1\/.+$/, '').replace(/\/+$/, '');
        setEndpoint(base);
        setApiKey(config.api_key);
        setModelName(config.model_name);
        setSavingsProfile((config.savings_profile as SavingsProfile) || 'balanced');
      }
    } catch (error) {
      console.error('Failed to load AI config:', error);
    }
  }

  async function fetchModels() {
    const base = normalizeBaseUrl(endpoint);
    if (!base || !apiKey) {
      setModelsError('Enter the API host and key first');
      return;
    }
    setFetchingModels(true);
    setModelsError(null);
    try {
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const ids: string[] = (json.data ?? []).map((m: { id: string }) => m.id).sort();
      setAvailableModels(ids);
      if (ids.length > 0 && !ids.includes(modelName)) {
        setModelName(ids[0]);
      }
      setShowModelDropdown(true);
    } catch (e) {
      setModelsError('Failed to fetch models. Check host and API key.');
      console.error(e);
    } finally {
      setFetchingModels(false);
    }
  }

  async function loadCustomPromptFlags() {
    const profiles: SavingsProfile[] = ['relaxed', 'balanced', 'aggressive'];
    const flags: Record<SavingsProfile, boolean> = { relaxed: false, balanced: false, aggressive: false };
    await Promise.all(
      profiles.map(async (p) => {
        const prompt = await getProfilePrompt(p);
        flags[p] = prompt !== null;
      })
    );
    setCustomPromptFlags(flags);
  }

  async function openPromptEditor(profile: SavingsProfile) {
    const existing = await getProfilePrompt(profile);
    const defaultPrompt = buildDefaultPromptTemplate(profile);
    setPromptEditor({
      profile,
      value: existing ?? defaultPrompt,
      isCustom: existing !== null,
      saving: false,
    });
  }

  function closePromptEditor() {
    setPromptEditor(null);
  }

  function handleRevertToDefault() {
    if (!promptEditor) return;
    setPromptEditor({
      ...promptEditor,
      value: buildDefaultPromptTemplate(promptEditor.profile),
      isCustom: false,
    });
  }

  async function handleSavePrompt() {
    if (!promptEditor) return;
    setPromptEditor((prev) => prev ? { ...prev, saving: true } : null);
    try {
      const defaultPrompt = buildDefaultPromptTemplate(promptEditor.profile);
      const isDefault = promptEditor.value.trim() === defaultPrompt.trim();
      await saveProfilePrompt(promptEditor.profile, isDefault ? null : promptEditor.value);
      setCustomPromptFlags((prev) => ({ ...prev, [promptEditor.profile]: !isDefault }));
      closePromptEditor();
    } catch (error) {
      console.error('Failed to save prompt:', error);
      setPromptEditor((prev) => prev ? { ...prev, saving: false } : null);
    }
  }

  async function handleRefreshTypes() {
    if (!activeAccountId) return;
    setRefreshingTypes(true);
    setTypesRefreshed(null);
    try {
      const count = await refreshLinodeTypes(activeAccountId);
      setTypesRefreshed(count);
      setTimeout(() => setTypesRefreshed(null), 4000);
    } catch (error) {
      console.error('Failed to refresh Linode types:', error);
      alert('Failed to refresh Linode instance types');
    } finally {
      setRefreshingTypes(false);
    }
  }

  async function handleSave() {
    if (!endpoint || !apiKey || !modelName) {
      alert('Please fill in all fields');
      return;
    }

    const base = normalizeBaseUrl(endpoint);
    setLoading(true);
    try {
      await saveAIConfig({
        api_endpoint: `${base}/v1/chat/completions`,
        api_key: apiKey,
        model_name: modelName,
        savings_profile: savingsProfile,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setShow(false); }, 1500);
    } catch (error) {
      console.error('Failed to save AI config:', error);
      alert('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500";

  return (
    <>
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
        title="Settings"
      >
        <Settings size={16} className="text-gray-500 dark:text-gray-400" />
        Settings
      </button>

      {show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Settings</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Configure your AI endpoint and cost optimization preferences
                </p>
              </div>
              <button
                onClick={() => setShow(false)}
                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ml-4 flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  API Host
                </label>
                <input
                  type="url"
                  placeholder="https://llm.example.com"
                  value={endpoint}
                  onChange={(e) => { setEndpoint(e.target.value); setAvailableModels([]); setModelsError(null); setShowModelDropdown(false); }}
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Host only — <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/v1/chat/completions</code> and <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/v1/models</code> are appended automatically
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Your API key will be stored securely
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Model Name
                  </label>
                  <button
                    type="button"
                    onClick={fetchModels}
                    disabled={fetchingModels || !endpoint || !apiKey}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {fetchingModels ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {fetchingModels ? 'Fetching...' : 'Fetch Models'}
                  </button>
                </div>
                {showModelDropdown && availableModels.length > 0 ? (
                  <div className="relative">
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className={`${inputClass} pr-10 appearance-none cursor-pointer`}
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="gpt-4"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className={inputClass}
                  />
                )}
                {modelsError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{modelsError}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Model to use for generating recommendations
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                  Savings Profile
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(SAVINGS_PROFILE_LABELS) as SavingsProfile[]).map((profile) => {
                    const info = SAVINGS_PROFILE_LABELS[profile];
                    const colors = profileColors[profile];
                    const editColors = promptEditColors[profile];
                    const Icon = profileIcons[profile];
                    const isActive = savingsProfile === profile;
                    const hasCustomPrompt = customPromptFlags[profile];

                    return (
                      <div key={profile} className="relative">
                        <button
                          type="button"
                          onClick={() => setSavingsProfile(profile)}
                          className={`relative flex flex-col items-start gap-2 p-4 pb-10 rounded-xl border-2 text-left transition-all w-full ${
                            isActive
                              ? colors.active
                              : `bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 ${colors.border} ${colors.hover}`
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              size={16}
                              className={isActive ? 'text-white' : colors.icon}
                            />
                            <span className="font-semibold text-sm">{info.label}</span>
                            {hasCustomPrompt && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                isActive ? 'bg-white/20 text-white' : editColors.badge
                              }`}>
                                custom
                              </span>
                            )}
                          </div>
                          <p className={`text-xs leading-relaxed ${isActive ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'}`}>
                            {info.description}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openPromptEditor(profile); }}
                          className={`absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            isActive
                              ? 'bg-white/15 text-white border-white/30 hover:bg-white/25'
                              : `${editColors.btn} border`
                          }`}
                          title="Edit AI prompt for this profile"
                        >
                          <FileText size={11} />
                          Edit Prompt
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {saved && (
                <div className="p-3 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded-lg text-sm">
                  Configuration saved successfully!
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Linode Instance Prices</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Cached for 24 hours. Used by AI to suggest accurate plan changes.
                    </p>
                  </div>
                  <button
                    onClick={handleRefreshTypes}
                    disabled={refreshingTypes || !activeAccountId}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={!activeAccountId ? 'Select an account first' : 'Fetch latest prices from Linode'}
                  >
                    <RefreshCw size={15} className={refreshingTypes ? 'animate-spin' : ''} />
                    {refreshingTypes ? 'Fetching...' : 'Refresh Prices'}
                  </button>
                </div>
                {typesRefreshed !== null && (
                  <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                    Refreshed — {typesRefreshed} instance types cached.
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShow(false)}
                className="px-6 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !endpoint || !apiKey || !modelName}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-gray-600 dark:text-gray-300" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    Edit Prompt — {SAVINGS_PROFILE_LABELS[promptEditor.profile].label}
                  </h3>
                  {promptEditor.isCustom && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${promptEditColors[promptEditor.profile].badge}`}>
                      customized
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Customize the prompt sent to the AI when analyzing resources under this profile. Use{' '}
                  <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-gray-700 dark:text-gray-300 font-mono text-xs">{'{{variable}}'}</code>{' '}
                  placeholders — they will be filled in at runtime.
                </p>
              </div>
              <button
                onClick={closePromptEditor}
                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ml-4 flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">Available placeholders:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '{{resource_type}}', '{{label}}', '{{plan_type}}', '{{region}}', '{{monthly_cost}}',
                  '{{vcpus}}', '{{gpu_count}}', '{{memory_gb}}', '{{disk_gb}}', '{{data_points}}',
                  '{{cpu_avg}}', '{{cpu_max}}', '{{cpu_p95}}',
                  '{{cpu_raw_avg}}', '{{cpu_raw_max}}', '{{cpu_raw_p95}}',
                  '{{disk_avg}}', '{{disk_max}}', '{{swap_avg}}', '{{swap_max}}',
                  '{{net_in_avg}}', '{{net_in_max}}', '{{net_out_avg}}', '{{net_out_max}}',
                  '{{types_context}}',
                ].map((ph) => (
                  <code
                    key={ph}
                    className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-xs px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => {
                      const textarea = document.getElementById('prompt-editor-textarea') as HTMLTextAreaElement;
                      if (!textarea) return;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const newVal = promptEditor.value.slice(0, start) + ph + promptEditor.value.slice(end);
                      setPromptEditor((prev) => prev ? { ...prev, value: newVal, isCustom: true } : null);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + ph.length, start + ph.length);
                      }, 0);
                    }}
                  >
                    {ph}
                  </code>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-5">
              <textarea
                id="prompt-editor-textarea"
                value={promptEditor.value}
                onChange={(e) => setPromptEditor((prev) => prev ? { ...prev, value: e.target.value, isCustom: true } : null)}
                className={`w-full h-full min-h-[320px] px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-700 resize-none focus:outline-none focus:ring-2 focus:border-transparent ${promptEditColors[promptEditor.profile].ring}`}
                spellCheck={false}
              />
            </div>

            <div className="p-5 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={handleRevertToDefault}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <RotateCcw size={14} />
                Revert to Default
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closePromptEditor}
                  className="px-5 py-2 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  disabled={promptEditor.saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
                >
                  <Save size={14} />
                  {promptEditor.saving ? 'Saving...' : 'Save Prompt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
