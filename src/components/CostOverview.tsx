import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Server, Calendar, Sparkles, Clock } from 'lucide-react';
import { getCostHistory, getPotentialSavings } from '../lib/api';

interface CostOverviewProps {
  accountId: string | null;
  totalCost: number;
  resourceCount: number;
  refreshTrigger?: number;
}

export function CostOverview({ accountId, totalCost, resourceCount, refreshTrigger }: CostOverviewProps) {
  const [costHistory, setCostHistory] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<number>(30);
  const [potentialSavings, setPotentialSavings] = useState<number>(0);

  useEffect(() => {
    if (accountId) {
      loadCostHistory();
      loadPotentialSavings();
    }
  }, [accountId, timeRange, refreshTrigger]);

  async function loadCostHistory() {
    if (!accountId) return;

    try {
      const data = await getCostHistory(accountId, timeRange);
      setCostHistory(data);
    } catch (error) {
      console.error('Failed to load cost history:', error);
    }
  }

  async function loadPotentialSavings() {
    if (!accountId) return;

    try {
      const savings = await getPotentialSavings(accountId);
      setPotentialSavings(savings);
    } catch (error) {
      console.error('Failed to load potential savings:', error);
    }
  }

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const monthToDateCost = (totalCost / daysInMonth) * daysElapsed;
  const dailyCost = totalCost / daysInMonth;
  const projectedMonthlyCost = totalCost;

  const calculateCostTrend = () => {
    if (costHistory.length < 2) return null;

    const oldCost = Number(costHistory[0]?.total_cost) || 0;
    const newCost = Number(costHistory[costHistory.length - 1]?.total_cost) || 0;

    if (oldCost < 0.01) {
      return newCost > 0 ? Infinity : 0;
    }

    return ((newCost - oldCost) / oldCost) * 100;
  };

  const costTrend = calculateCostTrend();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Cost Overview</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange(7)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              timeRange === 7
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange(30)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              timeRange === 30
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            30 Days
          </button>
        </div>
      </div>

      {!accountId ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">Select an account to view cost overview</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Month to Date</span>
                <DollarSign size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">${monthToDateCost.toFixed(2)}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{daysElapsed} of {daysInMonth} days</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-800 dark:text-green-300">Resources</span>
                <Server size={20} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{resourceCount}</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Active resources</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/30 dark:to-sky-800/20 rounded-lg border border-sky-200 dark:border-sky-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-sky-800 dark:text-sky-300">Full Month</span>
                <Calendar size={20} className="text-sky-600 dark:text-sky-400" />
              </div>
              <p className="text-2xl font-bold text-sky-900 dark:text-sky-100">
                ${projectedMonthlyCost.toFixed(2)}
              </p>
              <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">Projected end of month</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Trend</span>
                <TrendingUp size={20} className="text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {costTrend === null || costTrend === Infinity ? (
                  <span className="text-lg">N/A</span>
                ) : (
                  <>
                    {costTrend > 0 ? '+' : ''}
                    {costTrend.toFixed(1)}%
                  </>
                )}
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                {costTrend === null
                  ? 'Insufficient data'
                  : costTrend === Infinity
                  ? 'New tracking period'
                  : `vs. ${timeRange} days ago`}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Daily Cost</span>
                <Clock size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">${dailyCost.toFixed(2)}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Per day this month</p>
            </div>

            <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">AI Savings</span>
                <Sparkles size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                ${potentialSavings.toFixed(2)}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Potential monthly savings</p>
            </div>
          </div>

          {costHistory.length > 0 && (() => {
            const costs = costHistory.map((d) => Number(d.total_cost));
            const dataMax = Math.max(...costs);
            const dataMin = Math.min(...costs);
            const yMax = dataMax > 0 ? Math.ceil(dataMax * 1.5 / 100) * 100 : 100;
            const yMin = dataMax > 0 ? Math.floor(dataMin * 0.75 / 100) * 100 : 0;
            const yRange = yMax - yMin;

            const formatY = (val: number) =>
              val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val}`;

            const yLabels = [yMax, yMin + yRange * 0.75, yMin + yRange * 0.5, yMin + yRange * 0.25, yMin];

            const xLabels = costHistory.map((d) => {
              const date = new Date(d.cost_date);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            });

            const barStep = costHistory.length > 1 ? Math.max(1, Math.floor(costHistory.length / 6)) : 1;

            return (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Monthly Cost Trend (Last {timeRange} Days)
                  </h3>
                  <span className="text-xs text-gray-400 dark:text-gray-500">values are monthly totals</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-col justify-between text-right pr-2" style={{ minWidth: '44px' }}>
                    {yLabels.map((val, i) => (
                      <span key={i} className="text-xs text-gray-400 dark:text-gray-500 leading-none">
                        {formatY(Math.round(val))}
                      </span>
                    ))}
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-end justify-between h-32 gap-1 border-l border-b border-gray-300 dark:border-gray-600">
                      {costHistory.map((day, index) => {
                        const cost = Number(day.total_cost);
                        const height = yRange > 0 ? ((cost - yMin) / yRange) * 100 : 0;

                        return (
                          <div key={index} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                            <div
                              className="w-full bg-blue-500 dark:bg-blue-600 rounded-t hover:bg-blue-600 dark:hover:bg-blue-500 transition-colors cursor-pointer"
                              style={{ height: `${Math.max(0, Math.min(100, height))}%`, minHeight: height > 0 ? '3px' : '0' }}
                            />
                            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 dark:bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                              <div>${cost.toFixed(2)}/mo</div>
                              <div className="text-gray-300 dark:text-gray-400">
                                {new Date(day.cost_date).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1">
                      {xLabels.map((label, i) => (
                        <span
                          key={i}
                          className="text-xs text-gray-400 dark:text-gray-500 text-center flex-1"
                          style={{ visibility: i % barStep === 0 || i === xLabels.length - 1 ? 'visible' : 'hidden' }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
