import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Check, X, CheckCircle, ChevronDown, Users } from 'lucide-react';
import { getAccounts, createAccount, deleteAccount, fetchLinodeResources, renameAccount } from '../lib/api';
import type { LinodeAccount } from '../types';

interface AccountManagerProps {
  onAccountSelect: (accountId: string | null) => void;
  selectedAccountId: string | null;
  onSyncComplete?: () => void;
  filterAccountIds?: string[];
}

export function AccountManager({ onAccountSelect, selectedAccountId, onSyncComplete, filterAccountIds }: AccountManagerProps) {
  const [accounts, setAccounts] = useState<LinodeAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadAccounts() {
    try {
      const data = await getAccounts();
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        onAccountSelect(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }

  async function handleAdd() {
    if (!name || !apiToken) return;
    setLoading(true);
    try {
      await createAccount(name, apiToken);
      setName('');
      setApiToken('');
      setShowAddForm(false);
      await loadAccounts();
    } catch (error) {
      console.error('Failed to add account:', error);
      alert('Failed to add account');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await deleteAccount(id);
      if (selectedAccountId === id) onAccountSelect(null);
      await loadAccounts();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account');
    }
  }

  async function handleSync(accountId: string) {
    setSyncing(accountId);
    setSyncDone(null);
    setSyncProgress(null);
    try {
      await fetchLinodeResources(accountId, (msg) => setSyncProgress(msg));
      await loadAccounts();
      setSyncProgress(null);
      setSyncDone(accountId);
      onSyncComplete?.();
      setTimeout(() => setSyncDone((prev) => (prev === accountId ? null : prev)), 2500);
    } catch (error: any) {
      console.error('Failed to sync resources:', error);
      setSyncProgress(null);
      alert(`Sync failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setSyncing(null);
    }
  }

  function startRename(account: LinodeAccount) {
    setRenamingId(account.id);
    setRenameValue(account.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return cancelRename();
    try {
      await renameAccount(id, trimmed);
      await loadAccounts();
    } catch (error) {
      console.error('Failed to rename account:', error);
      alert('Failed to rename account');
    } finally {
      setRenamingId(null);
      setRenameValue('');
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        <Users size={16} className="text-blue-600 dark:text-blue-400" />
        <span className="max-w-[160px] truncate">
          {selectedAccount ? selectedAccount.name : 'Select Account'}
        </span>
        <ChevronDown size={14} className={`text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Linode Accounts</span>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} />
              Add Account
            </button>
          </div>

          {showAddForm && (
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <input
                type="text"
                placeholder="Account Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 mb-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <input
                type="password"
                placeholder="Linode API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={loading || !name || !apiToken}
                  className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-colors"
                >
                  {loading ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto">
            {accounts.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">No accounts added yet</p>
            ) : (
              accounts.filter(a => !filterAccountIds || filterAccountIds.includes(a.id)).map((account) => (
                <div
                  key={account.id}
                  onClick={() => { onAccountSelect(account.id); setOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-700/50 last:border-0 transition-colors ${
                    selectedAccountId === account.id
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    {renamingId === account.id ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(account.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          className="text-sm font-semibold text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-700 border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
                        />
                        <button
                          onClick={() => commitRename(account.id)}
                          className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-colors flex-shrink-0"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={cancelRename}
                          className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group/name">
                        <span className={`text-sm font-semibold truncate ${selectedAccountId === account.id ? 'text-blue-700 dark:text-blue-400' : 'text-gray-800 dark:text-gray-100'}`}>
                          {account.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(account); }}
                          className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded opacity-0 group-hover/name:opacity-100 transition-all flex-shrink-0"
                        >
                          <Pencil size={11} />
                        </button>
                      </div>
                    )}
                    {syncing === account.id && syncProgress ? (
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                        <span className="inline-block w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                        {syncProgress}
                      </p>
                    ) : syncDone === account.id ? (
                      <p className="text-xs text-green-500 dark:text-green-400 mt-0.5">
                        Sync complete
                      </p>
                    ) : account.last_sync_at ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Synced {new Date(account.last_sync_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleSync(account.id)}
                      disabled={syncing === account.id}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        syncDone === account.id
                          ? 'text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40'
                          : 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                      }`}
                      title="Sync Resources"
                    >
                      {syncDone === account.id ? (
                        <CheckCircle size={15} />
                      ) : (
                        <RefreshCw size={15} className={syncing === account.id ? 'animate-spin' : ''} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                      title="Delete Account"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
