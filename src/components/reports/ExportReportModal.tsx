import { useState, useEffect } from 'react';
import {
  X, Download, FileText, FileCode, Calendar, Shield, ChevronDown,
  Loader2, CheckCircle, XCircle, Minus, AlertTriangle, Server,
  Building2, Clock,
} from 'lucide-react';
import { getReportComplianceResultsLatest, getReportComplianceScoreHistory, getResources, getComplianceProfiles } from '../../lib/api';
import type { ComplianceResultRow, ScoreHistoryEntry } from './types';
import type { Resource } from '../../types';

interface Profile {
  id: string;
  name: string;
  description: string;
  rule_condition_types: string[];
}

interface ExportReportModalProps {
  accountId: string;
  accountName?: string;
  onClose: () => void;
}

type QuarterOption = { label: string; startDate: Date; endDate: Date };

function buildQuarterOptions(): QuarterOption[] {
  const now = new Date();
  const options: QuarterOption[] = [];

  for (let i = 0; i < 6; i++) {
    let year = now.getFullYear();
    let quarter = Math.floor(now.getMonth() / 3) - i;
    while (quarter < 0) { quarter += 4; year--; }
    const startMonth = quarter * 3;
    const endMonth = startMonth + 2;
    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, endMonth + 1, 0, 23, 59, 59);
    options.push({
      label: `Q${quarter + 1} ${year}`,
      startDate,
      endDate,
    });
  }
  options.unshift({
    label: 'Last 30 days',
    startDate: new Date(Date.now() - 30 * 86400_000),
    endDate: new Date(),
  });
  options.unshift({
    label: 'Last 90 days',
    startDate: new Date(Date.now() - 90 * 86400_000),
    endDate: new Date(),
  });
  return options;
}

const QUARTER_OPTIONS = buildQuarterOptions();

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  linode: 'Virtual Machines',
  volume: 'Block Storage',
  object_storage: 'Object Storage',
  lke_cluster: 'Kubernetes',
  database: 'Databases',
  nodebalancer: 'Load Balancers',
  firewall: 'Firewalls',
  vpc: 'VPC',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function severityOrder(s: string) { return s === 'critical' ? 0 : s === 'warning' ? 1 : 2; }

function buildHtmlReport(opts: {
  accountName: string;
  periodLabel: string;
  startDate: Date;
  endDate: Date;
  profileName: string | null;
  scoreHistory: ScoreHistoryEntry[];
  results: ComplianceResultRow[];
  resources: Resource[];
  generatedAt: Date;
}): string {
  const { accountName, periodLabel, startDate, endDate, profileName, scoreHistory, results, resources, generatedAt } = opts;

  const periodScores = scoreHistory.filter(s => {
    const d = new Date(s.evaluated_at);
    return d >= startDate && d <= endDate;
  });

  const latestScore = periodScores.length > 0 ? periodScores[periodScores.length - 1] : null;
  const firstScore = periodScores.length > 0 ? periodScores[0] : null;
  const scoreDelta = latestScore && firstScore && latestScore.compliance_score != null && firstScore.compliance_score != null
    ? latestScore.compliance_score - firstScore.compliance_score
    : null;

  const nonCompliant = results.filter(r => r.status === 'non_compliant' && !r.acknowledged);
  const compliant = results.filter(r => r.status === 'compliant');
  const acked = results.filter(r => r.status === 'non_compliant' && r.acknowledged);

  const ruleMap = new Map<string, { name: string; severity: string; pass: number; fail: number; na: number; ack: number; results: ComplianceResultRow[] }>();
  for (const r of results) {
    if (!ruleMap.has(r.rule_id)) {
      ruleMap.set(r.rule_id, {
        name: r.compliance_rules?.name ?? 'Unknown',
        severity: r.compliance_rules?.severity ?? 'info',
        pass: 0, fail: 0, na: 0, ack: 0, results: [],
      });
    }
    const e = ruleMap.get(r.rule_id)!;
    if (r.status === 'compliant') e.pass++;
    else if (r.status === 'non_compliant' && r.acknowledged) e.ack++;
    else if (r.status === 'non_compliant') e.fail++;
    else e.na++;
    e.results.push(r);
  }

  const ruleRows = Array.from(ruleMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.fail - a.fail);

  const typeMap = resources.reduce((acc, r) => {
    acc[r.resource_type] = (acc[r.resource_type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const regionMap = resources.reduce((acc, r) => {
    if (!r.region) return acc;
    acc[r.region] = (acc[r.region] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const scoreRows = periodScores.map(s => `
    <tr>
      <td>${fmtDateTime(s.evaluated_at)}</td>
      <td class="score">${s.compliance_score != null ? s.compliance_score.toFixed(1) + '%' : 'N/A'}</td>
      <td class="pass">${s.compliant_count}</td>
      <td class="fail">${s.non_compliant_count}</td>
      <td>${s.not_applicable_count}</td>
      <td>${s.acknowledged_count}</td>
      <td>${s.total_results}</td>
    </tr>
  `).join('');

  const violationsSection = nonCompliant.length === 0
    ? `<p class="empty">No open violations during this period.</p>`
    : nonCompliant.sort((a, b) => severityOrder(a.compliance_rules?.severity ?? 'info') - severityOrder(b.compliance_rules?.severity ?? 'info'))
      .map(r => `
        <tr>
          <td><span class="badge ${r.compliance_rules?.severity ?? 'info'}">${(r.compliance_rules?.severity ?? 'info').toUpperCase()}</span></td>
          <td>${r.compliance_rules?.name ?? 'Unknown Rule'}</td>
          <td>${r.resources?.label ?? '<em>Account-level</em>'}</td>
          <td>${r.resources?.region ?? '—'}</td>
          <td class="detail">${r.detail ?? '—'}</td>
          <td>${fmtDate(r.evaluated_at)}</td>
        </tr>
      `).join('');

  const compliantSection = compliant.length === 0
    ? `<p class="empty">No passing results found.</p>`
    : compliant.sort((a, b) => severityOrder(a.compliance_rules?.severity ?? 'info') - severityOrder(b.compliance_rules?.severity ?? 'info'))
      .map(r => `
        <tr>
          <td><span class="badge ${r.compliance_rules?.severity ?? 'info'}">${(r.compliance_rules?.severity ?? 'info').toUpperCase()}</span></td>
          <td>${r.compliance_rules?.name ?? 'Unknown Rule'}</td>
          <td>${r.resources?.label ?? '<em>Account-level</em>'}</td>
          <td>${r.resources?.region ?? '—'}</td>
          <td>${fmtDate(r.evaluated_at)}</td>
        </tr>
      `).join('');

  const ackedSection = acked.length === 0
    ? `<p class="empty">No acknowledged findings.</p>`
    : acked.sort((a, b) => severityOrder(a.compliance_rules?.severity ?? 'info') - severityOrder(b.compliance_rules?.severity ?? 'info'))
      .map(r => {
        const acknowledgerName = r.acknowledger?.email || '—';
        const acknowledgedOn = r.acknowledged_at ? fmtDateTime(r.acknowledged_at) : '—';
        const ackNote = r.acknowledged_note ?? '—';
        const followUpNotes = r.notes && r.notes.length > 0
          ? `<tr><td colspan="8" style="padding:0 10px 10px 10px;background:#fffbeb;">
              <table style="width:100%;border-collapse:collapse;background:#fef9ec;border:1px solid #fde68a;border-radius:6px;overflow:hidden;">
                <thead><tr style="background:#fef3c7;">
                  <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#92400e;padding:6px 10px;border-bottom:1px solid #fde68a;">Follow-up Notes</th>
                  <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#92400e;padding:6px 10px;border-bottom:1px solid #fde68a;">Author</th>
                  <th style="text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#92400e;padding:6px 10px;border-bottom:1px solid #fde68a;">Date &amp; Time</th>
                </tr></thead>
                <tbody>
                  ${r.notes!.map((n, i) => `
                  <tr style="${i > 0 ? 'border-top:1px solid #fde68a;' : ''}">
                    <td style="padding:6px 10px;font-size:12px;color:#374151;">${n.note}</td>
                    <td style="padding:6px 10px;font-size:11px;color:#6b7280;white-space:nowrap;">${n.author?.email ?? 'Unknown'}</td>
                    <td style="padding:6px 10px;font-size:11px;color:#6b7280;white-space:nowrap;">${fmtDateTime(n.created_at)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </td></tr>`
          : '';
        return `
        <tr>
          <td><span class="badge ${r.compliance_rules?.severity ?? 'info'}">${(r.compliance_rules?.severity ?? 'info').toUpperCase()}</span></td>
          <td>${r.compliance_rules?.name ?? 'Unknown Rule'}</td>
          <td>${r.resources?.label ?? '<em>Account-level</em>'}</td>
          <td>${r.resources?.region ?? '—'}</td>
          <td class="detail">${r.detail ?? '—'}</td>
          <td>${acknowledgerName}</td>
          <td>${acknowledgedOn}</td>
          <td class="detail">${ackNote}</td>
        </tr>
        ${followUpNotes}
      `}).join('');

  const ruleTableRows = ruleRows.map(row => {
    const total = row.pass + row.fail + row.ack + row.na;
    const scoreable = row.pass + row.fail + row.ack;
    const pct = scoreable > 0 ? ((row.pass / scoreable) * 100).toFixed(0) + '%' : 'N/A';
    const statusClass = row.fail === 0 ? 'pass' : row.fail > 0 && row.pass === 0 ? 'fail' : '';
    return `
      <tr>
        <td><span class="badge ${row.severity}">${row.severity.toUpperCase()}</span></td>
        <td>${row.name}</td>
        <td class="${statusClass}">${pct}</td>
        <td class="pass">${row.pass}</td>
        <td class="fail">${row.fail}</td>
        <td>${row.ack}</td>
        <td>${row.na}</td>
        <td>${total}</td>
      </tr>
    `;
  }).join('');

  const inventoryRows = Object.entries(typeMap).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
    <tr>
      <td>${RESOURCE_TYPE_LABELS[type] ?? type}</td>
      <td>${count}</td>
      <td>${Math.round((count / resources.length) * 100)}%</td>
    </tr>
  `).join('');

  const regionRows = Object.entries(regionMap).sort((a, b) => b[1] - a[1]).map(([region, count]) => `
    <tr>
      <td>${region}</td>
      <td>${count}</td>
    </tr>
  `).join('');

  const scoreVal = latestScore?.compliance_score != null ? `${latestScore.compliance_score.toFixed(1)}%` : 'N/A';
  const deltaStr = scoreDelta != null ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(1)}pp over period` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compliance Report — ${accountName} — ${periodLabel}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1a202c; background: #fff; line-height: 1.5; }
  .page { max-width: 960px; margin: 0 auto; padding: 48px 40px; }
  h1 { font-size: 26px; font-weight: 700; color: #111827; }
  h2 { font-size: 16px; font-weight: 700; color: #111827; margin-top: 36px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
  h3 { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 28px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; font-size: 11px; color: #6b7280; }
  .subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
  .meta { display: flex; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
  .meta-item { }
  .meta-item .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; }
  .meta-item .value { font-size: 13px; font-weight: 600; color: #111827; margin-top: 2px; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin: 20px 0; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
  .kpi .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; }
  .kpi .kpi-value { font-size: 28px; font-weight: 800; color: #111827; margin-top: 4px; line-height: 1; }
  .kpi .kpi-sub { font-size: 11px; color: #6b7280; margin-top: 6px; }
  .kpi.green { border-color: #d1fae5; background: #f0fdf4; }
  .kpi.green .kpi-value { color: #065f46; }
  .kpi.red { border-color: #fee2e2; background: #fff5f5; }
  .kpi.red .kpi-value { color: #991b1b; }
  .kpi.blue { border-color: #dbeafe; background: #eff6ff; }
  .kpi.blue .kpi-value { color: #1d4ed8; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; padding: 8px 10px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) { background: #fafafa; }
  td.pass { color: #065f46; font-weight: 600; }
  td.fail { color: #991b1b; font-weight: 600; }
  td.score { font-weight: 700; }
  td.detail { color: #6b7280; font-size: 11px; max-width: 280px; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge.critical { background: #fee2e2; color: #991b1b; }
  .badge.warning { background: #fef3c7; color: #92400e; }
  .badge.info { background: #dbeafe; color: #1e40af; }
  .empty { color: #6b7280; font-style: italic; padding: 16px 0; }
  .section-intro { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  .notice { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #1e40af; margin-bottom: 16px; }
  @media print {
    body { font-size: 12px; }
    .page { padding: 20px; }
    h2 { page-break-before: auto; }
    .no-break { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <h1>Compliance Report</h1>
      <p class="subtitle">Infrastructure Security &amp; Compliance Evidence Package</p>
      <div class="meta">
        <div class="meta-item">
          <div class="label">Account</div>
          <div class="value">${accountName}</div>
        </div>
        <div class="meta-item">
          <div class="label">Period</div>
          <div class="value">${periodLabel}</div>
        </div>
        <div class="meta-item">
          <div class="label">Date Range</div>
          <div class="value">${fmtDateShort(startDate)} – ${fmtDateShort(endDate)}</div>
        </div>
        ${profileName ? `
        <div class="meta-item">
          <div class="label">Benchmark</div>
          <div class="value">${profileName}</div>
        </div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div>Generated ${generatedAt.toLocaleString()}</div>
    </div>
  </div>

  <div class="notice">
    This report is auto-generated from live infrastructure compliance data. It is intended as supporting evidence for audits and certifications. All findings reflect the latest evaluation snapshot.
  </div>

  <h2>Executive Summary</h2>
  <div class="kpis no-break">
    <div class="kpi ${latestScore?.compliance_score != null && latestScore.compliance_score >= 80 ? 'green' : 'red'}">
      <div class="kpi-label">Compliance Score</div>
      <div class="kpi-value">${scoreVal}</div>
      <div class="kpi-sub">${deltaStr || (latestScore ? `${latestScore.compliant_count} passing / ${latestScore.total_results} total` : 'No data')}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Evaluations</div>
      <div class="kpi-value">${periodScores.length}</div>
      <div class="kpi-sub">runs in period</div>
    </div>
    <div class="kpi ${nonCompliant.length === 0 ? 'green' : 'red'}">
      <div class="kpi-label">Open Violations</div>
      <div class="kpi-value">${nonCompliant.length}</div>
      <div class="kpi-sub">${nonCompliant.filter(r => r.compliance_rules?.severity === 'critical').length} critical unacknowledged</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Acknowledged</div>
      <div class="kpi-value">${acked.length}</div>
      <div class="kpi-sub">risk-accepted findings</div>
    </div>
    <div class="kpi blue">
      <div class="kpi-label">Resources Evaluated</div>
      <div class="kpi-value">${resources.length}</div>
      <div class="kpi-sub">${Object.keys(typeMap).length} resource types across ${Object.keys(regionMap).length} region${Object.keys(regionMap).length !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <h2>Compliance Score History</h2>
  <p class="section-intro">Compliance score over time during the selected period. Each row represents one evaluation run.</p>
  ${periodScores.length === 0 ? '<p class="empty">No evaluations found in this period.</p>' : `
  <table class="no-break">
    <thead>
      <tr>
        <th>Date</th>
        <th>Score</th>
        <th>Passing</th>
        <th>Failing</th>
        <th>N/A</th>
        <th>Acknowledged</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${scoreRows}</tbody>
  </table>`}

  <h2>Open Violations</h2>
  <p class="section-intro">All unacknowledged non-compliant findings as of the latest evaluation. These represent active risks requiring remediation or risk acceptance.</p>
  ${nonCompliant.length === 0 ? '<p class="empty">No open violations. All checks are passing or acknowledged.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Rule</th>
        <th>Resource</th>
        <th>Region</th>
        <th>Finding</th>
        <th>Evaluated</th>
      </tr>
    </thead>
    <tbody>${violationsSection}</tbody>
  </table>`}

  <h2>Passing Checks (${compliant.length})</h2>
  <p class="section-intro">All resources and rules that passed compliance evaluation as of the latest snapshot. These confirm controls are operating effectively.</p>
  ${compliant.length === 0 ? '<p class="empty">No passing results found.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Rule</th>
        <th>Resource</th>
        <th>Region</th>
        <th>Evaluated</th>
      </tr>
    </thead>
    <tbody>${compliantSection}</tbody>
  </table>`}

  <h2>Acknowledged Findings (${acked.length})</h2>
  <p class="section-intro">Non-compliant findings that have been explicitly risk-accepted. These are excluded from the compliance score but documented here for audit traceability.</p>
  ${acked.length === 0 ? '<p class="empty">No acknowledged findings.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Rule</th>
        <th>Resource</th>
        <th>Region</th>
        <th>Finding</th>
        <th>Acknowledged By</th>
        <th>Acknowledged On</th>
        <th>Note</th>
      </tr>
    </thead>
    <tbody>${ackedSection}</tbody>
  </table>`}

  <h2>Rule-by-Rule Status</h2>
  <p class="section-intro">Compliance status across all evaluated rules. Pass rate is calculated as passing / (passing + failing + acknowledged).</p>
  ${ruleRows.length === 0 ? '<p class="empty">No rule results found.</p>' : `
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Rule</th>
        <th>Pass Rate</th>
        <th>Pass</th>
        <th>Fail</th>
        <th>Acked</th>
        <th>N/A</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${ruleTableRows}</tbody>
  </table>`}

  <h2>Resource Inventory</h2>
  <p class="section-intro">Summary of all infrastructure resources scoped to this account at time of report generation.</p>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 8px;">
    <div>
      <h3>By Resource Type</h3>
      <table>
        <thead><tr><th>Type</th><th>Count</th><th>Share</th></tr></thead>
        <tbody>${inventoryRows}</tbody>
      </table>
    </div>
    <div>
      <h3>By Region</h3>
      <table>
        <thead><tr><th>Region</th><th>Resources</th></tr></thead>
        <tbody>${regionRows}</tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    <span>Linode Compliance Manager · ${accountName}</span>
    <span>Generated ${generatedAt.toLocaleString()} · Period: ${periodLabel}</span>
  </div>
</div>
</body>
</html>`;
}

function buildCsv(opts: {
  periodLabel: string;
  scoreHistory: ScoreHistoryEntry[];
  results: ComplianceResultRow[];
  resources: Resource[];
  startDate: Date;
  endDate: Date;
}): string {
  const { periodLabel, scoreHistory, results, resources, startDate, endDate } = opts;
  const lines: string[] = [];

  const periodScores = scoreHistory.filter(s => {
    const d = new Date(s.evaluated_at);
    return d >= startDate && d <= endDate;
  });

  lines.push(`Compliance Report — ${periodLabel}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');

  lines.push('=== SCORE HISTORY ===');
  lines.push('Date & Time,Score,Passing,Failing,N/A,Acknowledged,Total');
  for (const s of periodScores) {
    lines.push([
      `"${fmtDateTime(s.evaluated_at)}"`,
      s.compliance_score?.toFixed(2) ?? '',
      s.compliant_count,
      s.non_compliant_count,
      s.not_applicable_count,
      s.acknowledged_count,
      s.total_results,
    ].join(','));
  }

  lines.push('');
  lines.push('=== COMPLIANCE RESULTS ===');
  lines.push('Severity,Rule,Resource,Region,Status,Acknowledged,Acknowledged By,Acknowledged At,Acknowledgement Note,Finding,Evaluated At');
  for (const r of results) {
    lines.push([
      r.compliance_rules?.severity ?? '',
      `"${r.compliance_rules?.name ?? ''}"`,
      `"${r.resources?.label ?? 'Account'}"`,
      r.resources?.region ?? '',
      r.status,
      r.acknowledged ? 'Yes' : 'No',
      `"${r.acknowledger?.email ?? ''}"`,
      r.acknowledged_at ? `"${fmtDateTime(r.acknowledged_at)}"` : '',
      `"${(r.acknowledged_note ?? '').replace(/"/g, "'")}"`,
      `"${(r.detail ?? '').replace(/"/g, "'")}"`,
      fmtDate(r.evaluated_at),
    ].join(','));
  }

  const ackedWithNotes = results.filter(r => r.acknowledged && r.notes && r.notes.length > 0);
  if (ackedWithNotes.length > 0) {
    lines.push('');
    lines.push('=== FOLLOW-UP NOTES ON ACKNOWLEDGED FINDINGS ===');
    lines.push('Rule,Resource,Note,Author,Date & Time');
    for (const r of ackedWithNotes) {
      for (const n of r.notes!) {
        lines.push([
          `"${r.compliance_rules?.name ?? ''}"`,
          `"${r.resources?.label ?? 'Account'}"`,
          `"${n.note.replace(/"/g, "'")}"`,
          `"${n.author?.email ?? 'Unknown'}"`,
          `"${fmtDateTime(n.created_at)}"`,
        ].join(','));
      }
    }
  }

  lines.push('');
  lines.push('=== INVENTORY ===');
  lines.push('Label,Type,Region,Status,Monthly Cost (USD)');
  for (const r of resources) {
    lines.push([
      `"${r.label}"`,
      RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type,
      r.region ?? '',
      r.status ?? '',
      r.monthly_cost?.toFixed(2) ?? '0.00',
    ].join(','));
  }

  return lines.join('\n');
}

export function ExportReportModal({ accountId, accountName = 'Account', onClose }: ExportReportModalProps) {
  const [selectedQuarter, setSelectedQuarter] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<string>('all');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryEntry[]>([]);
  const [results, setResults] = useState<ComplianceResultRow[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  useEffect(() => {
    async function init() {
      setFetching(true);
      try {
        const [scores, res, allProfiles, allResources] = await Promise.all([
          getReportComplianceScoreHistory(accountId, 180),
          getReportComplianceResultsLatest(accountId),
          getComplianceProfiles(),
          getResources(accountId),
        ]);
        setScoreHistory(scores as ScoreHistoryEntry[]);
        setResults(res as ComplianceResultRow[]);
        setProfiles(allProfiles as Profile[]);
        setResources(allResources);
      } catch {}
      setFetching(false);
    }
    init();
  }, [accountId]);

  const quarter = QUARTER_OPTIONS[selectedQuarter];
  const profileObj = profiles.find(p => p.id === selectedProfile);

  function filterResultsByProfile(r: ComplianceResultRow[]): ComplianceResultRow[] {
    if (selectedProfile === 'all' || !profileObj) return r;
    const conditionTypes = new Set(profileObj.rule_condition_types);
    return r.filter(result => {
      const conditionType = result.compliance_rules?.condition_type;
      return conditionType && conditionTypes.has(conditionType);
    });
  }

  function doExportHtml() {
    setLoading(true);
    try {
      const filtered = filterResultsByProfile(results);
      const html = buildHtmlReport({
        accountName,
        periodLabel: quarter.label,
        startDate: quarter.startDate,
        endDate: quarter.endDate,
        profileName: profileObj?.name ?? null,
        scoreHistory,
        results: filtered,
        resources,
        generatedAt: new Date(),
      });
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        setTimeout(() => { win.print(); }, 600);
      }
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  function doExportCsv() {
    setLoading(true);
    try {
      const filtered = filterResultsByProfile(results);
      const csv = buildCsv({
        periodLabel: quarter.label,
        scoreHistory,
        results: filtered,
        resources,
        startDate: quarter.startDate,
        endDate: quarter.endDate,
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = accountName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const safeQuarter = quarter.label.replace(/\s+/g, '-').toLowerCase();
      a.download = `compliance-report-${safeName}-${safeQuarter}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  const filteredResults = filterResultsByProfile(results);
  const nonCompliantCount = filteredResults.filter(r => r.status === 'non_compliant' && !r.acknowledged).length;
  const latestScore = scoreHistory.length > 0 ? scoreHistory[scoreHistory.length - 1] : null;
  const periodEvaluationCount = scoreHistory.filter(s => {
    const d = new Date(s.evaluated_at);
    return d >= quarter.startDate && d <= quarter.endDate;
  }).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <FileText size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">Export Compliance Report</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Generate audit evidence or certification documentation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {fetching ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Loading report data...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                <Building2 size={14} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Account</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{accountName}</p>
                </div>
                {latestScore?.compliance_score != null && (
                  <div className={`text-right flex-shrink-0 ${latestScore.compliance_score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Score</p>
                    <p className="text-lg font-bold leading-none">{latestScore.compliance_score.toFixed(1)}%</p>
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar size={12} />
                  Reporting Period
                </label>
                <div className="relative">
                  <select
                    value={selectedQuarter}
                    onChange={e => setSelectedQuarter(Number(e.target.value))}
                    className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 pr-8 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {QUARTER_OPTIONS.map((opt, i) => (
                      <option key={i} value={i}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 ml-0.5">
                  {fmtDateShort(quarter.startDate)} — {fmtDateShort(quarter.endDate)}
                </p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  <Shield size={12} />
                  Benchmark / Profile
                </label>
                <div className="relative">
                  <select
                    value={selectedProfile}
                    onChange={e => setSelectedProfile(e.target.value)}
                    className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 pr-8 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Rules (no filter)</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {profileObj && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 ml-0.5 leading-relaxed">
                    {profileObj.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 py-1">
                <div className="text-center p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Evals</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{periodEvaluationCount}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">in period</p>
                </div>
                <div className="text-center p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Results</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{filteredResults.length}</p>
                </div>
                <div className={`text-center p-3 rounded-lg border ${nonCompliantCount > 0 ? 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10' : 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Violations</p>
                  <p className={`text-xl font-bold ${nonCompliantCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{nonCompliantCount}</p>
                </div>
                <div className="text-center p-3 rounded-lg border border-blue-100 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/10">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Resources</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{resources.length}</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Export Format</p>
                <button
                  onClick={doExportHtml}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-blue-600 text-white flex-shrink-0">
                    <FileText size={15} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">HTML Report (Print / PDF)</p>
                    <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-0.5">Opens a print-ready report — use browser Print → Save as PDF for certified evidence</p>
                  </div>
                  <Download size={14} className="text-blue-400 flex-shrink-0 group-hover:translate-y-0.5 transition-transform" />
                </button>

                <button
                  onClick={doExportCsv}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group disabled:opacity-50"
                >
                  <div className="p-2 rounded-lg bg-gray-700 dark:bg-gray-600 text-white flex-shrink-0">
                    <FileCode size={15} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">CSV Export</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Score history, all compliance results, and full inventory in a single spreadsheet file</p>
                  </div>
                  <Download size={14} className="text-gray-400 flex-shrink-0 group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>

              <div className="flex items-start gap-2 text-[10px] text-gray-400 dark:text-gray-500 pt-1">
                <Clock size={11} className="flex-shrink-0 mt-0.5" />
                <span>Reports are generated from current data. For point-in-time evidence, export immediately after each evaluation run.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
