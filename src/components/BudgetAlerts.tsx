import { useState, useEffect } from 'react';
import { DollarSign, Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { getBudgets, createBudget, updateBudget, deleteBudget } from '../lib/api';
import type { Budget } from '../types';

interface BudgetAlertsProps {
  currentSpending: number;
  accountId: string | null;
}

export function BudgetAlerts({ currentSpending, accountId }: BudgetAlertsProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [threshold, setThreshold] = useState('80');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (accountId) {
      loadBudgets();
    } else {
      setBudgets([]);
    }
  }, [accountId]);

  async function loadBudgets() {
    if (!accountId) return;
    try {
      const data = await getBudgets(accountId);
      setBudgets(data);
    } catch (error) {
      console.error('Failed to load budgets:', error);
    }
  }

  async function handleSave() {
    if (!name || !monthlyLimit || !accountId) return;

    setLoading(true);
    try {
      if (editingId) {
        await updateBudget(editingId, {
          name,
          monthly_limit: parseFloat(monthlyLimit),
          alert_threshold: parseFloat(threshold),
        });
      } else {
        await createBudget({
          name,
          account_id: accountId,
          monthly_limit: parseFloat(monthlyLimit),
          alert_threshold: parseFloat(threshold),
          is_active: true,
        });
      }
      resetForm();
      await loadBudgets();
    } catch (error) {
      console.error('Failed to save budget:', error);
      alert('Failed to save budget');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this budget?')) return;

    try {
      await deleteBudget(id);
      await loadBudgets();
    } catch (error) {
      console.error('Failed to delete budget:', error);
      alert('Failed to delete budget');
    }
  }

  async function handleToggle(budget: Budget) {
    try {
      await updateBudget(budget.id, { is_active: !budget.is_active });
      await loadBudgets();
    } catch (error) {
      console.error('Failed to toggle budget:', error);
    }
  }

  function handleEdit(budget: Budget) {
    setEditingId(budget.id);
    setName(budget.name);
    setMonthlyLimit(budget.monthly_limit.toString());
    setThreshold(budget.alert_threshold.toString());
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setMonthlyLimit('');
    setThreshold('80');
  }

  function getBudgetStatus(budget: Budget) {
    const percentage = (currentSpending / budget.monthly_limit) * 100;
    const alertThreshold = budget.alert_threshold;

    if (percentage >= 100) {
      return { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40', status: 'Exceeded' };
    } else if (percentage >= alertThreshold) {
      return { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/40', status: 'Warning' };
    }
    return { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40', status: 'On Track' };
  }

  const inputClass = "w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Budget Alerts</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          disabled={!accountId}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={18} />
          Add Budget
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
          <input
            type="text"
            placeholder="Budget Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} mb-2`}
          />
          <input
            type="number"
            placeholder="Monthly Limit ($)"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            className={`${inputClass} mb-2`}
          />
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Alert Threshold — send a warning when spending reaches this % of the monthly limit
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={`${inputClass} pr-10`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium pointer-events-none">%</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={loading || !name || !monthlyLimit}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
            >
              {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {budgets.map((budget) => {
          const status = getBudgetStatus(budget);
          const percentage = Math.min((currentSpending / budget.monthly_limit) * 100, 100);

          return (
            <div
              key={budget.id}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">{budget.name}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.bg} ${status.color}`}>
                      {status.status}
                    </span>
                    {!budget.is_active && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">${currentSpending.toFixed(2)}</span> of{' '}
                    <span className="font-medium">${budget.monthly_limit.toFixed(2)}</span>
                    {' '}({percentage.toFixed(1)}%)
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(budget)}
                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(budget.id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full transition-all ${
                    percentage >= 100
                      ? 'bg-red-500'
                      : percentage >= budget.alert_threshold
                      ? 'bg-orange-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {percentage >= budget.alert_threshold && budget.is_active && (
                <div className="mt-3 flex items-start gap-2 p-2 bg-orange-50 dark:bg-orange-900/30 rounded text-sm text-orange-800 dark:text-orange-300">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {percentage >= 100
                      ? 'Budget exceeded! Consider reviewing your resources.'
                      : `You've reached ${percentage.toFixed(1)}% of your budget limit.`}
                  </span>
                </div>
              )}

              <button
                onClick={() => handleToggle(budget)}
                className={`mt-3 text-sm ${
                  budget.is_active
                    ? 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                }`}
              >
                {budget.is_active ? 'Disable' : 'Enable'} alerts
              </button>
            </div>
          );
        })}
      </div>

      {budgets.length === 0 && !showForm && (
        <div className="text-center py-8">
          <DollarSign size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-2" />
          {accountId ? (
            <>
              <p className="text-gray-600 dark:text-gray-300">No budgets configured</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a budget to track your spending</p>
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-300">No account selected</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a Linode account to manage budgets</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
