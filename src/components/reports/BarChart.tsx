interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  showValues?: boolean;
  maxValue?: number;
}

export function BarChart({ data, height = 120, showValues = true, maxValue }: BarChartProps) {
  if (!data.length) return null;
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);

  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            {showValues && (
              <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 truncate w-full text-center">
                {d.value > 0 ? d.value : ''}
              </span>
            )}
            <div
              className="w-full rounded-t-sm transition-all duration-500"
              style={{
                height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`,
                backgroundColor: d.color ?? '#3b82f6',
                opacity: 0.85,
              }}
            />
            <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate w-full text-center">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
