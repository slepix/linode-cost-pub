import type { SavingsProfile } from '../types';
import { SAVINGS_PROFILE_THRESHOLDS, SAVINGS_PROFILE_LABELS } from '../types';

export interface PromptContext {
  profileLabel: string;
  profile: SavingsProfile;
  metricsSummary: any;
  vcpus: number;
  gpus: number;
  normalizedCpuStats: { avg: number; max: number; min: number; p95: number };
  cpuStats: { avg: number; max: number; min: number; p95: number };
  diskStats: { avg: number; max: number; min: number; p95: number };
  swapStats: { avg: number; max: number; min: number; p95: number };
  networkInStats: { avg: number; max: number; min: number; p95: number };
  networkOutStats: { avg: number; max: number; min: number; p95: number };
  metricsDataLength: number;
  typesContext: string;
}

export function buildDefaultPromptTemplate(profile: SavingsProfile): string {
  const thresholds = SAVINGS_PROFILE_THRESHOLDS[profile];
  const profileLabel = SAVINGS_PROFILE_LABELS[profile].label;

  const lines = [
    'You are a cloud infrastructure cost optimization expert. Analyze the following Linode resource metrics and provide recommendations.',
    '',
    `Savings Profile: ${profileLabel}`,
    '',
    'Resource Information:',
    '- Type: {{resource_type}}',
    '- Label: {{label}}',
    '- Current Plan: {{plan_type}}',
    '- Region: {{region}}',
    '- Monthly Cost: ${{monthly_cost}}',
    '- Specs: {{vcpus}} vCPU, {{memory_gb}}GB RAM, {{disk_gb}}GB disk, {{gpu_count}} GPU(s)',
    '',
    'Metrics Summary (last 7 days, {{data_points}} data points):',
    'NOTE: CPU usage is normalized to per-core percentage (raw Linode values divided by {{vcpus}} vCPUs).',
    '- CPU Usage (normalized, per-core): avg={{cpu_avg}}%, max={{cpu_max}}%, p95={{cpu_p95}}%',
    '- CPU Usage (raw, cumulative across all cores): avg={{cpu_raw_avg}}%, max={{cpu_raw_max}}%, p95={{cpu_raw_p95}}%',
    '- Disk I/O: avg={{disk_avg}}, max={{disk_max}}',
    '- Swap I/O: avg={{swap_avg}}, max={{swap_max}} (non-zero swap activity indicates RAM pressure)',
    '- Network In: avg={{net_in_avg}} Mbps, max={{net_in_max}} Mbps',
    '- Network Out: avg={{net_out_avg}} Mbps, max={{net_out_max}} Mbps',
    '{{types_context}}',
    '',
    `Recommendation Criteria (Savings Profile: ${profileLabel}):`,
    'Base resize decisions on CPU, Disk I/O, and Swap I/O metrics. Do not use network metrics for resize decisions.',
    '⚠️ CRITICAL GPU RULE: If {{gpu_count}} > 0, this instance has a GPU. You MUST NEVER suggest a non-GPU plan (e.g., g6-standard-*, g6-nanode-*, g6-highmem-*, g6-dedicated-*). The suggested_plan MUST be a GPU plan (e.g., g1-gpu-*, g2-gpu-*) or null. Violating this rule is not acceptable under any circumstance.',
    `- DOWNSIZE if: CPU avg < ${thresholds.downsize_cpu_avg}% AND p95 < ${thresholds.downsize_cpu_p95}% AND disk I/O is low AND swap I/O avg == 0 — suggest the next smaller GPU type from the list above (GPU instances only) or the next smaller non-GPU type (non-GPU instances only)`,
    `- UPGRADE if: CPU avg > ${thresholds.upgrade_cpu_avg}% OR p95 > ${thresholds.upgrade_cpu_p95}% OR disk I/O is consistently high OR swap I/O is non-zero (RAM pressure) — suggest the next larger type from the list above`,
    '- OPTIMIZE if: Resource is underutilized but has occasional spikes warranting caution',
    '- DELETE_UNUSED if: All metrics are near-zero (resource appears truly idle)',
    '- NO_ACTION if: Resource is operating normally within thresholds or if the current plan is g6-nanode-1. This is the smallest plan Linode has so we cannot downsize any further.',
    'If {{gpu_count}} > 0 and there is no smaller GPU plan available in the list, use NO_ACTION instead of suggesting a non-GPU plan.',
    '',
    'Use the normalized (per-core) CPU values for threshold comparisons.',
    'When suggesting a plan change, use the exact type IDs from the list and calculate accurate price differences.',
    '',
    'IMPORTANT — Metrics Visibility Limitations:',
    'We do NOT have direct visibility into RAM usage or GPU usage for this resource. Therefore:',
    '- CPU and Disk I/O are the primary signals for resize decisions.',
    '- Swap I/O is available and acts as an indirect RAM pressure indicator: if swap_avg or swap_max are non-zero, the instance is under memory pressure and should NOT be downsized — consider upgrading RAM instead.',
    '- GPU usage is not observable. If {{gpu_count}} > 0, treat the resource conservatively.',
    '- Your "note" field MUST clearly state that RAM was inferred indirectly via Swap I/O activity, that direct RAM and GPU metrics were not available, and that sizing was based on CPU and Disk I/O with Swap as a RAM pressure signal.',
    '',
    'Provide a JSON response with:',
    '{',
    '  "recommendation_type": "downsize|upgrade|optimize|no_action|delete_unused",',
    '  "current_plan": "current plan id",',
    '  "suggested_plan": "suggested plan id from the types list or null",',
    '  "title": "brief title",',
    '  "reasoning": "detailed reasoning referencing actual normalized CPU metric values",',
    '  "note": "mandatory caveat: state that sizing was inferred from CPU and Disk I/O only, and that RAM and GPU usage were not observable",',
    '  "estimated_savings": monthly savings in USD (positive number) or 0,',
    '  "estimated_cost_increase": monthly cost increase in USD (positive number) or 0,',
    '  "confidence_score": 0-100 based on data quality and how clear the signal is',
    '}',
  ];
  return lines.join('\n');
}

export function renderPrompt(template: string, ctx: PromptContext): string {
  return template
    .replace(/\{\{resource_type\}\}/g, ctx.metricsSummary.resource_type)
    .replace(/\{\{label\}\}/g, ctx.metricsSummary.label)
    .replace(/\{\{plan_type\}\}/g, ctx.metricsSummary.plan_type ?? '')
    .replace(/\{\{region\}\}/g, ctx.metricsSummary.region ?? '')
    .replace(/\{\{monthly_cost\}\}/g, String(ctx.metricsSummary.monthly_cost))
    .replace(/\{\{vcpus\}\}/g, String(ctx.vcpus))
    .replace(/\{\{gpu_count\}\}/g, String(ctx.gpus))
    .replace(/\{\{memory_gb\}\}/g, String((ctx.metricsSummary.specs?.memory || 0) / 1024))
    .replace(/\{\{disk_gb\}\}/g, String((ctx.metricsSummary.specs?.disk || 0) / 1024))
    .replace(/\{\{data_points\}\}/g, String(ctx.metricsDataLength))
    .replace(/\{\{cpu_avg\}\}/g, ctx.normalizedCpuStats.avg.toFixed(2))
    .replace(/\{\{cpu_max\}\}/g, ctx.normalizedCpuStats.max.toFixed(2))
    .replace(/\{\{cpu_p95\}\}/g, ctx.normalizedCpuStats.p95.toFixed(2))
    .replace(/\{\{cpu_raw_avg\}\}/g, ctx.cpuStats.avg.toFixed(2))
    .replace(/\{\{cpu_raw_max\}\}/g, ctx.cpuStats.max.toFixed(2))
    .replace(/\{\{cpu_raw_p95\}\}/g, ctx.cpuStats.p95.toFixed(2))
    .replace(/\{\{disk_avg\}\}/g, ctx.diskStats.avg.toFixed(2))
    .replace(/\{\{disk_max\}\}/g, ctx.diskStats.max.toFixed(2))
    .replace(/\{\{swap_avg\}\}/g, ctx.swapStats.avg.toFixed(2))
    .replace(/\{\{swap_max\}\}/g, ctx.swapStats.max.toFixed(2))
    .replace(/\{\{net_in_avg\}\}/g, (ctx.networkInStats.avg / 1_000_000).toFixed(3))
    .replace(/\{\{net_in_max\}\}/g, (ctx.networkInStats.max / 1_000_000).toFixed(3))
    .replace(/\{\{net_out_avg\}\}/g, (ctx.networkOutStats.avg / 1_000_000).toFixed(3))
    .replace(/\{\{net_out_max\}\}/g, (ctx.networkOutStats.max / 1_000_000).toFixed(3))
    .replace(/\{\{types_context\}\}/g, ctx.typesContext);
}
