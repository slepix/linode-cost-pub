import { useState, useEffect } from 'react';
import { Activity, X } from 'lucide-react';
import { fetchLinodeMetrics } from '../lib/api';
import type { Resource } from '../types';

interface MetricsViewerProps {
  resource: Resource | null;
  onClose: () => void;
}

export function MetricsViewer({ resource, onClose }: MetricsViewerProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resource) {
      loadMetrics();
    }
  }, [resource, timeRange]);

  async function loadMetrics() {
    if (!resource) return;

    setLoading(true);
    try {
      const data = await fetchLinodeMetrics(resource.id, timeRange);
      setMetrics(data);
    } catch (error) {
      console.error('Failed to load metrics:', error);
      alert(`Failed to load metrics: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!resource) return null;

  const vcpus: number = resource.specs?.vcpus || 1;

  const timeRangeLabels: Record<string, string> = {
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
  };

  function getMetricColor(value: number, type: string) {
    if (type === 'cpu') {
      if (value > 80) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40';
      if (value > 60) return 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40';
      return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40';
    }
    return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40';
  }

  function renderLineChart(
    data: any[],
    metricType: string,
    color: string,
    valueFormatter: (v: number) => string = (v) => v.toFixed(2)
  ) {
    const filtered = data.filter((m: any) => m.metric_type === metricType);
    if (filtered.length === 0) return null;

    const values = filtered.map((m: any) => m.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue || 1;

    const width = 600;
    const height = 120;
    const padding = { top: 10, right: 10, bottom: 20, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = filtered.map((m: any, i: number) => {
      const x = padding.left + (i / (filtered.length - 1 || 1)) * chartWidth;
      const y =
        padding.top + chartHeight - ((m.value - minValue) / range) * chartHeight;
      return `${x},${y}`;
    });

    return (
      <div className="mt-4">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50"
        >
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, i) => {
            const [x, y] = point.split(',').map(Number);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="2"
                fill={color}
                className="opacity-50"
              />
            );
          })}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="#6b7280"
            strokeWidth="1"
          />
        </svg>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-2">
          <span>Min: {valueFormatter(minValue)}</span>
          <span>Max: {valueFormatter(maxValue)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Resource Metrics</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {resource.label} · {resource.resource_type}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-6">
            {Object.entries(timeRangeLabels).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTimeRange(value)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  timeRange === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {resource.resource_type !== 'linode' && resource.resource_type !== 'nodebalancer' ? (
            <div className="text-center py-12">
              <Activity size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-3" />
              <p className="text-gray-600 dark:text-gray-300">Metrics are only available for Linode instances and NodeBalancers</p>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-300">Loading metrics...</p>
            </div>
          ) : metrics && metrics.resource_type === 'nodebalancer' && metrics.aggregated ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Connections</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                      {metrics.aggregated.connections.avg.toFixed(1)} avg/s
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{metrics.aggregated.connections.avg.toFixed(2)}/s</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{metrics.aggregated.connections.max.toFixed(2)}/s</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Minimum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{metrics.aggregated.connections.min.toFixed(2)}/s</span>
                    </div>
                  </div>
                  {metrics.metrics && renderLineChart(metrics.metrics, 'connections', '#3b82f6', (v) => `${v.toFixed(1)}/s`)}
                </div>

                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Traffic In</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">
                      {(metrics.aggregated.traffic_in.avg / 1000000).toFixed(1)} Mbps
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{(metrics.aggregated.traffic_in.avg / 1000000).toFixed(2)} Mbps</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{(metrics.aggregated.traffic_in.max / 1000000).toFixed(2)} Mbps</span>
                    </div>
                  </div>
                  {metrics.metrics && renderLineChart(metrics.metrics, 'traffic_in', '#10b981', (v) => `${(v / 1000000).toFixed(2)} Mbps`)}
                </div>

                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Traffic Out</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
                      {(metrics.aggregated.traffic_out.avg / 1000000).toFixed(1)} Mbps
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{(metrics.aggregated.traffic_out.avg / 1000000).toFixed(2)} Mbps</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{(metrics.aggregated.traffic_out.max / 1000000).toFixed(2)} Mbps</span>
                    </div>
                  </div>
                  {metrics.metrics && renderLineChart(metrics.metrics, 'traffic_out', '#14b8a6', (v) => `${(v / 1000000).toFixed(2)} Mbps`)}
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">{metrics.metrics_count}</span> data points collected over {timeRangeLabels[timeRange].toLowerCase()}
                </p>
              </div>
            </div>
          ) : metrics && metrics.aggregated ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">CPU Usage</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getMetricColor(
                        (metrics.aggregated.cpu.avg / vcpus),
                        'cpu'
                      )}`}
                    >
                      {(metrics.aggregated.cpu.avg / vcpus).toFixed(1)}% avg
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Normalized per-core ({vcpus} vCPU{vcpus > 1 ? 's' : ''} · raw max {(vcpus * 100)}%)
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.cpu.avg / vcpus).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.cpu.max / vcpus).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Minimum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.cpu.min / vcpus).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        (metrics.aggregated.cpu.avg / vcpus) > 80
                          ? 'bg-red-500'
                          : (metrics.aggregated.cpu.avg / vcpus) > 60
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(metrics.aggregated.cpu.avg / vcpus, 100)}%` }}
                    />
                  </div>
                  {metrics.metrics &&
                    renderLineChart(
                      metrics.metrics.map((m: any) =>
                        m.metric_type === 'cpu_usage' ? { ...m, value: m.value / vcpus } : m
                      ),
                      'cpu_usage',
                      '#3b82f6',
                      (v) => `${v.toFixed(1)}%`
                    )}
                </div>

                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Disk I/O</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                      {metrics.aggregated.disk_io.avg.toFixed(0)} avg
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {metrics.aggregated.disk_io.avg.toFixed(2)} blocks
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {metrics.aggregated.disk_io.max.toFixed(2)} blocks
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Minimum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {metrics.aggregated.disk_io.min.toFixed(2)} blocks
                      </span>
                    </div>
                  </div>
                  {metrics.metrics &&
                    renderLineChart(
                      metrics.metrics,
                      'disk_io',
                      '#10b981',
                      (v) => `${v.toFixed(0)} blocks`
                    )}
                </div>

                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Swap I/O</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        metrics.aggregated.swap_io.avg > 0
                          ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {metrics.aggregated.swap_io.avg.toFixed(0)} avg
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Non-zero values indicate RAM pressure
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {metrics.aggregated.swap_io.avg.toFixed(2)} blocks
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {metrics.aggregated.swap_io.max.toFixed(2)} blocks
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Minimum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {metrics.aggregated.swap_io.min === Infinity ? '0.00' : metrics.aggregated.swap_io.min.toFixed(2)} blocks
                      </span>
                    </div>
                  </div>
                  {metrics.metrics &&
                    renderLineChart(
                      metrics.metrics,
                      'swap_io',
                      '#f97316',
                      (v) => `${v.toFixed(0)} blocks`
                    )}
                </div>

                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Network In</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                      {(metrics.aggregated.network_in.avg / 1000000).toFixed(1)} Mbps
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.network_in.avg / 1000000).toFixed(2)} Mbps
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.network_in.max / 1000000).toFixed(2)} Mbps
                      </span>
                    </div>
                  </div>
                  {metrics.metrics &&
                    renderLineChart(
                      metrics.metrics,
                      'network_in',
                      '#8b5cf6',
                      (v) => `${(v / 1000000).toFixed(2)} Mbps`
                    )}
                </div>

                <div className="p-4 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Network Out</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
                      {(metrics.aggregated.network_out.avg / 1000000).toFixed(1)} Mbps
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Average:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.network_out.avg / 1000000).toFixed(2)} Mbps
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Maximum:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {(metrics.aggregated.network_out.max / 1000000).toFixed(2)} Mbps
                      </span>
                    </div>
                  </div>
                  {metrics.metrics &&
                    renderLineChart(
                      metrics.metrics,
                      'network_out',
                      '#14b8a6',
                      (v) => `${(v / 1000000).toFixed(2)} Mbps`
                    )}
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">{metrics.metrics_count}</span> data points
                  collected over {timeRangeLabels[timeRange].toLowerCase()}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-300">No metrics data available</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Metrics will be collected after syncing the account
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700/80 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
