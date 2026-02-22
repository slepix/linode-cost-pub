import { useEffect, useRef, useState } from 'react';

interface LineChartProps {
  series: Array<{
    label: string;
    data: Array<{ x: string; y: number }>;
    color: string;
    dashed?: boolean;
  }>;
  height?: number;
  yLabel?: string;
  xTickCount?: number;
  formatY?: (v: number) => string;
  highlightIndex?: number;
}

function formatXLabel(iso: string, allIsos: string[], index: number): string {
  const d = new Date(iso);
  const dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const firstOccurrence = allIsos.findIndex(x => {
    const dx = new Date(x);
    return dx.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) === dateKey;
  });
  if (index === firstOccurrence) return dateKey;
  return timeStr;
}

export function LineChart({ series, height = 200, yLabel, xTickCount = 6, formatY, highlightIndex }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
    });
    obs.observe(el);
    setContainerW(el.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, []);

  if (!series.length || !series[0].data.length) return null;

  const allValues = series.flatMap(s => s.data.map(d => d.y));
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues, minY + 1);
  const range = maxY - minY || 1;

  const allXIsos = series[0].data.map(d => d.x);
  const totalPoints = allXIsos.length;

  const svgW = 600;
  const svgH = height;
  const padL = 48;
  const padR = 16;
  const padT = 12;
  const padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const scaleX = svgW / Math.max(containerW, 1);

  function xPos(i: number) {
    return padL + (i / Math.max(totalPoints - 1, 1)) * plotW;
  }
  function yPos(v: number) {
    return padT + (1 - (v - minY) / range) * plotH;
  }

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    minY + (range / yTicks) * i
  );

  const step = Math.max(1, Math.floor(totalPoints / xTickCount));
  const xTicks = allXIsos
    .map((iso, i) => ({ iso, i }))
    .filter(({ i }) => i === 0 || i === totalPoints - 1 || i % step === 0);

  return (
    <div className="w-full" ref={containerRef}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
      >
        {yTickValues.map((v, idx) => (
          <g key={idx}>
            <line
              x1={padL} y1={yPos(v)} x2={svgW - padR} y2={yPos(v)}
              stroke="currentColor" strokeWidth="0.5" className="text-gray-200 dark:text-gray-700" opacity="0.7"
            />
            <g transform={`translate(${padL - 6}, ${yPos(v) + 3}) scale(${scaleX}, 1)`}>
              <text
                textAnchor="end" fontSize="9" fill="currentColor"
                className="text-gray-400 dark:text-gray-500"
              >
                {formatY ? formatY(v) : Math.round(v)}
              </text>
            </g>
          </g>
        ))}

        {xTicks.map(({ iso, i }) => {
          const lbl = formatXLabel(iso, allXIsos, i);
          const isTime = lbl.includes(':');
          return (
            <g key={i} transform={`translate(${xPos(i)}, ${svgH - padB + 14}) scale(${scaleX}, 1)`}>
              <text
                textAnchor="middle" fontSize="8" fill="currentColor"
                className={isTime ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}
              >
                {lbl}
              </text>
            </g>
          );
        })}

        {series.map((s, si) => {
          if (!s.data.length) return null;
          const pts = s.data.map((d, i) => `${xPos(i)},${yPos(d.y)}`).join(' ');
          return (
            <polyline
              key={si}
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '5,3' : undefined}
              opacity="0.9"
            />
          );
        })}

        {highlightIndex != null && highlightIndex >= 0 && highlightIndex < totalPoints && (() => {
          const hx = xPos(highlightIndex);
          const firstSeries = series[0];
          const hy = firstSeries?.data[highlightIndex] ? yPos(firstSeries.data[highlightIndex].y) : padT;
          const color = firstSeries?.color ?? '#2563eb';
          return (
            <g>
              <line
                x1={hx} y1={padT} x2={hx} y2={svgH - padB}
                stroke={color} strokeWidth="1.5" strokeDasharray="3,2" opacity="0.6"
              />
              <circle cx={hx} cy={hy} r="4" fill={color} stroke="white" strokeWidth="1.5" opacity="0.95" />
            </g>
          );
        })()}

        {yLabel && (
          <g transform={`translate(10, ${svgH / 2}) rotate(-90) scale(${scaleX}, 1)`}>
            <text
              textAnchor="middle" fontSize="9" fill="currentColor"
              className="text-gray-400 dark:text-gray-500"
            >
              {yLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
