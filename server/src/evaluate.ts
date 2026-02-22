import { supabase } from './supabase.js';

export async function runComplianceEvaluation(accountId: string) {
  const { data: resources } = await supabase
    .from('resources')
    .select('*')
    .eq('account_id', accountId);

  const { data: rules } = await supabase
    .from('compliance_rules')
    .select('*')
    .eq('is_active', true)
    .or(`account_id.is.null,account_id.eq.${accountId}`);

  if (!resources || !rules) return { evaluated: 0, compliant: 0, non_compliant: 0 };

  const { data: accountRow } = await supabase
    .from('linode_accounts')
    .select('api_token')
    .eq('id', accountId)
    .maybeSingle();

  const { data: allExisting } = await supabase
    .from('compliance_results')
    .select('rule_id, resource_id, acknowledged, acknowledged_at, acknowledged_note, acknowledged_by')
    .eq('account_id', accountId);

  const ackMap = new Map<string, { acknowledged_at: string | null; acknowledged_note: string | null; acknowledged_by: string | null }>();
  for (const row of allExisting || []) {
    if (row.acknowledged) {
      ackMap.set(`${row.rule_id}:${row.resource_id ?? ''}`, {
        acknowledged_at: row.acknowledged_at,
        acknowledged_note: row.acknowledged_note,
        acknowledged_by: row.acknowledged_by ?? null,
      });
    }
  }

  await supabase.from('compliance_results').delete().eq('account_id', accountId);

  const results: any[] = [];
  const evaluatedAt = new Date().toISOString();
  const firewallResources = resources.filter((r: any) => r.resource_type === 'firewall');
  const nonCompositeRules = rules.filter((r: any) => r.condition_type !== 'composite');
  const compositeRules = rules.filter((r: any) => r.condition_type === 'composite');

  for (const rule of nonCompositeRules) {
    if (rule.condition_type === 'login_allowed_ips') {
      if (!accountRow?.api_token) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No API token available to check login history.', evaluated_at: evaluatedAt });
        continue;
      }
      try {
        const res = await fetch('https://api.linode.com/v4/account/logins', {
          headers: { Authorization: `Bearer ${accountRow.api_token}`, accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const logins: any[] = data.data || [];
        const allowedIPs: string[] = rule.condition_config?.allowed_ips || [];
        if (logins.length === 0) {
          results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No login history found to evaluate.', evaluated_at: evaluatedAt });
        } else if (allowedIPs.length === 0) {
          results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No allowed IPs configured for this rule.', evaluated_at: evaluatedAt });
        } else {
          for (const login of logins) {
            const ip: string = login.ip || 'unknown';
            const isAllowed = allowedIPs.includes(ip);
            const loginLabel = `${login.username} from ${ip} on ${new Date(login.datetime).toLocaleString()}`;
            results.push({
              rule_id: rule.id, resource_id: null, account_id: accountId,
              status: isAllowed ? 'compliant' : 'non_compliant',
              detail: isAllowed
                ? `Login allowed: ${loginLabel} — IP ${ip} is in the allowed list.`
                : `Login from unexpected IP: ${loginLabel} — IP ${ip} is not in the allowed list.`,
              evaluated_at: evaluatedAt,
            });
          }
        }
      } catch (e: any) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: `Could not fetch login history: ${e?.message || 'unknown error'}`, evaluated_at: evaluatedAt });
      }
      continue;
    }

    if (rule.condition_type === 'tfa_users') {
      if (!accountRow?.api_token) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No API token available to check user TFA status.', evaluated_at: evaluatedAt });
        continue;
      }
      try {
        const res = await fetch('https://api.linode.com/v4/account/users', {
          headers: { Authorization: `Bearer ${accountRow.api_token}`, accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const users: any[] = data.data || [];
        const excludeTypes: string[] = rule.condition_config?.exclude_user_types || ['proxy'];
        const filtered = users.filter((u: any) => !excludeTypes.includes(u.user_type));
        if (filtered.length === 0) {
          results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No users found to evaluate.', evaluated_at: evaluatedAt });
        } else {
          for (const user of filtered) {
            const hasTfa: boolean = user.tfa_enabled === true;
            results.push({
              rule_id: rule.id, resource_id: null, account_id: accountId,
              status: hasTfa ? 'compliant' : 'non_compliant',
              detail: hasTfa
                ? `User "${user.username}" has TFA enabled.`
                : `User "${user.username}" does not have TFA enabled.`,
              evaluated_at: evaluatedAt,
            });
          }
        }
      } catch (e: any) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: `Could not fetch users: ${e?.message || 'unknown error'}`, evaluated_at: evaluatedAt });
      }
      continue;
    }

    if (rule.condition_type === 'lke_control_plane_acl') {
      const lkeClusters = resources.filter((r: any) => r.resource_type === 'lke_cluster');
      for (const resource of lkeClusters) {
        if (!accountRow?.api_token) {
          results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'not_applicable', detail: 'No API token available to check control plane ACL.', evaluated_at: evaluatedAt });
          continue;
        }
        try {
          const aclRes = await fetch(
            `https://api.linode.com/v4/lke/clusters/${resource.resource_id}/control_plane_acl`,
            { headers: { Authorization: `Bearer ${accountRow.api_token}`, accept: 'application/json' } }
          );
          if (aclRes.status === 400) { results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'not_applicable', detail: 'This cluster does not support Control Plane ACL.', evaluated_at: evaluatedAt }); continue; }
          if (aclRes.status === 404) { results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'not_applicable', detail: 'Cluster not found when checking Control Plane ACL.', evaluated_at: evaluatedAt }); continue; }
          if (!aclRes.ok) throw new Error(`HTTP ${aclRes.status}`);
          const aclData = await aclRes.json();
          const acl = aclData.acl || {};
          const enabled: boolean = acl.enabled ?? false;
          if (!enabled) {
            results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'non_compliant', detail: 'Control plane ACL is not enabled. The Kubernetes API server is accessible from any IP.', evaluated_at: evaluatedAt });
            continue;
          }
          const ipv4: string[] = acl.addresses?.ipv4 || [];
          const ipv6: string[] = acl.addresses?.ipv6 || [];
          const openV4 = ipv4.filter((ip: string) => ip === '0.0.0.0/0');
          const openV6 = ipv6.filter((ip: string) => ip === '::/0');
          if (openV4.length > 0 || openV6.length > 0) {
            const open = [...openV4, ...openV6].join(', ');
            results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'non_compliant', detail: `Control plane ACL is enabled but allows unrestricted access: ${open}. Remove wildcard entries and restrict to known CIDRs.`, evaluated_at: evaluatedAt });
          } else {
            const allCidrs = [...ipv4, ...ipv6];
            results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'compliant', detail: `Control plane ACL is enabled and restricted to: ${allCidrs.join(', ') || 'no addresses (deny all)'}`, evaluated_at: evaluatedAt });
          }
        } catch (e: any) {
          results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status: 'not_applicable', detail: `Could not fetch control plane ACL: ${e?.message || 'unknown error'}`, evaluated_at: evaluatedAt });
        }
      }
      continue;
    }

    const applicableResources = resources.filter((r: any) => rule.resource_types.includes(r.resource_type));

    for (const resource of applicableResources) {
      let status = 'compliant';
      let detail = 'Passed';

      switch (rule.condition_type) {
        case 'firewall_attached': {
          const attachedFws: any[] = resource.specs?.attached_firewalls || [];
          const linodeId = parseInt(resource.resource_id, 10);
          const viaEntity = firewallResources.filter((fw: any) =>
            (fw.specs?.entities || []).some((e: any) => e.id === linodeId)
          );
          const allFws = [
            ...attachedFws,
            ...viaEntity
              .filter((fw: any) => !attachedFws.some((a: any) => a.id === parseInt(fw.resource_id, 10)))
              .map((fw: any) => ({ id: parseInt(fw.resource_id, 10), label: fw.label, status: fw.status })),
          ];
          const hasFw = allFws.length > 0;
          status = hasFw ? 'compliant' : 'non_compliant';
          detail = hasFw
            ? `Protected by firewall: ${allFws.map((f: any) => f.label).join(', ')}`
            : 'No firewall is attached to this Linode.';
          break;
        }
        case 'firewall_has_targets': {
          const count = resource.specs?.entity_count ?? 0;
          status = count > 0 ? 'compliant' : 'non_compliant';
          detail = count > 0 ? `Attached to ${count} Linode(s).` : 'Firewall has no attached Linodes.';
          break;
        }
        case 'no_open_inbound': {
          const sensitivePorts: number[] = rule.condition_config?.sensitive_ports || [22, 3389, 3306, 5432];
          const inboundRules = resource.specs?.inbound_rules_detail || [];
          const violations: string[] = [];
          for (const r of inboundRules) {
            if (r.action !== 'ACCEPT') continue;
            const protocol: string = (r.protocol || '').toUpperCase();
            if (protocol !== 'TCP' && protocol !== 'ALL') continue;
            const ipv4 = r.addresses?.ipv4 || [];
            const ipv6 = r.addresses?.ipv6 || [];
            const isOpen = ipv4.includes('0.0.0.0/0') || ipv6.includes('::/0') || ipv6.includes('2000::/3');
            if (isOpen) {
              const portRanges = r.ports || '';
              for (const p of sensitivePorts) {
                if (protocol === 'ALL' || portRanges === '' || portRanges.includes(String(p))) {
                  violations.push(`Port ${p} open to all (rule: ${r.label || 'unnamed'})`);
                }
              }
            }
          }
          if (violations.length > 0) { status = 'non_compliant'; detail = violations.join('; '); }
          else if (resource.specs?.inbound_policy === 'ACCEPT' && inboundRules.length === 0) { status = 'non_compliant'; detail = 'Inbound policy is ACCEPT with no rules — all traffic allowed.'; }
          else { status = 'compliant'; detail = 'No unrestricted inbound access detected.'; }
          break;
        }
        case 'min_node_count': {
          const minCount: number = rule.condition_config?.min_count ?? 2;
          const nodeCount = resource.specs?.node_count ?? resource.specs?.nodes?.length ?? 1;
          status = nodeCount >= minCount ? 'compliant' : 'non_compliant';
          detail = nodeCount >= minCount ? `Cluster has ${nodeCount} node(s).` : `Cluster has ${nodeCount} node(s); minimum required is ${minCount}.`;
          break;
        }
        case 'lke_control_plane_ha': {
          const ha: boolean = resource.specs?.high_availability ?? false;
          status = ha ? 'compliant' : 'non_compliant';
          detail = ha
            ? 'Control plane high availability is enabled for this cluster.'
            : 'Control plane high availability is not enabled. Enable HA to ensure the API server remains available during node failures.';
          break;
        }
        case 'lke_audit_logs_enabled': {
          const auditLogs: boolean | null = resource.specs?.audit_logs_enabled ?? null;
          if (auditLogs === null) { status = 'not_applicable'; detail = 'Audit logs status not available. Re-sync to fetch the latest cluster data.'; }
          else if (auditLogs === true) { status = 'compliant'; detail = 'Control plane audit logs are enabled for this cluster.'; }
          else { status = 'non_compliant'; detail = 'Control plane audit logs are disabled. Enable audit logging to track API activity for security and compliance purposes.'; }
          break;
        }
        case 'has_tags': {
          const tags: string[] = resource.specs?.tags || [];
          const requiredTags: Array<{ key: string; value: string }> = rule.condition_config?.required_tags || [];
          if (requiredTags.length > 0) {
            const missing: string[] = [];
            const wrongValue: string[] = [];
            for (const req of requiredTags) {
              if (!req.key) continue;
              const keyLower = req.key.toLowerCase();
              const matchingTag = tags.find((t: string) => {
                const tLower = t.toLowerCase();
                return tLower === keyLower || tLower.startsWith(keyLower + ':');
              });
              if (!matchingTag) { missing.push(req.key); }
              else if (req.value && req.value !== '*') {
                const colonIdx = matchingTag.indexOf(':');
                const tagValue = colonIdx !== -1 ? matchingTag.slice(colonIdx + 1).trim() : null;
                if (tagValue === null || tagValue.toLowerCase() !== req.value.toLowerCase()) {
                  wrongValue.push(`${req.key} (expected "${req.value}", found "${tagValue ?? matchingTag}")`);
                }
              }
            }
            if (missing.length > 0 || wrongValue.length > 0) {
              status = 'non_compliant';
              const parts: string[] = [];
              if (missing.length > 0) parts.push(`Missing tags: ${missing.join(', ')}`);
              if (wrongValue.length > 0) parts.push(`Wrong values: ${wrongValue.join('; ')}`);
              detail = parts.join('. ');
            } else {
              status = 'compliant';
              detail = `All required tags present: ${requiredTags.map(t => !t.value || t.value === '*' ? `${t.key}:*` : `${t.key}:${t.value}`).join(', ')}`;
            }
          } else {
            const minTags: number = rule.condition_config?.min_tags ?? 1;
            status = tags.length >= minTags ? 'compliant' : 'non_compliant';
            detail = tags.length >= minTags ? `Has ${tags.length} tag(s): ${tags.join(', ')}` : `Has no tags. At least ${minTags} tag(s) required.`;
          }
          break;
        }
        case 'volume_attached': {
          const isAttached = !!resource.specs?.linode_id;
          status = isAttached ? 'compliant' : 'non_compliant';
          detail = isAttached ? `Attached to Linode ID ${resource.specs.linode_id}.` : 'Volume is not attached to any Linode.';
          break;
        }
        case 'bucket_acl_check': {
          const acl: string | null = resource.specs?.acl ?? null;
          if (acl === null) { status = 'not_applicable'; detail = 'ACL data not available. Re-sync resources to fetch bucket access settings.'; break; }
          const forbiddenAcls: string[] = rule.condition_config?.forbidden_acls || ['public-read', 'public-read-write', 'authenticated-read'];
          const requiredAcl: string | null = rule.condition_config?.required_acl || null;
          if (requiredAcl && acl !== requiredAcl) { status = 'non_compliant'; detail = `Bucket ACL is "${acl}", expected "${requiredAcl}".`; }
          else if (forbiddenAcls.includes(acl)) { status = 'non_compliant'; detail = `Bucket ACL is "${acl}", which is not permitted.`; }
          else { status = 'compliant'; detail = `Bucket ACL is "${acl}".`; }
          break;
        }
        case 'bucket_cors_check': {
          const corsEnabled: boolean | null = resource.specs?.cors_enabled ?? null;
          if (corsEnabled === null) { status = 'not_applicable'; detail = 'CORS data not available. Re-sync resources to fetch bucket access settings.'; break; }
          const requireCorsDisabled: boolean = rule.condition_config?.require_cors_disabled ?? false;
          const requireCorsEnabled: boolean = rule.condition_config?.require_cors_enabled ?? false;
          if (requireCorsDisabled && corsEnabled) { status = 'non_compliant'; detail = 'CORS is enabled on this bucket; it must be disabled.'; }
          else if (requireCorsEnabled && !corsEnabled) { status = 'non_compliant'; detail = 'CORS is disabled on this bucket; it must be enabled.'; }
          else { status = 'compliant'; detail = `CORS is ${corsEnabled ? 'enabled' : 'disabled'}.`; }
          break;
        }
        case 'firewall_rules_check': {
          const linodeId2 = parseInt(resource.resource_id, 10);
          const directFws: any[] = resource.specs?.attached_firewalls || [];
          const viaEntityFws = firewallResources.filter((fw: any) =>
            (fw.specs?.entities || []).some((e: any) => e.id === linodeId2)
          );
          const allFwResources = [
            ...directFws.map((af: any) => firewallResources.find((fw: any) => parseInt(fw.resource_id, 10) === af.id)).filter(Boolean),
            ...viaEntityFws.filter((fw: any) => !directFws.some((af: any) => af.id === parseInt(fw.resource_id, 10))),
          ];
          if (allFwResources.length === 0) { status = 'non_compliant'; detail = 'No firewall is attached to this Linode.'; break; }
          const cfg = rule.condition_config || {};
          const requiredInboundPolicy: string | null = cfg.required_inbound_policy || null;
          const requiredOutboundPolicy: string | null = cfg.required_outbound_policy || null;
          const blockedPorts: number[] = cfg.blocked_ports || [];
          const allowedSourceIPs: string[] = cfg.allowed_source_ips || [];
          const requireNoOpenPorts: boolean = cfg.require_no_open_ports ?? false;
          const fwViolations: string[] = [];
          for (const fw of allFwResources) {
            const specs = (fw as any).specs || {};
            const inboundPolicy: string = (specs.inbound_policy || 'ACCEPT').toUpperCase();
            const outboundPolicy: string = (specs.outbound_policy || 'ACCEPT').toUpperCase();
            const inboundRules: any[] = specs.inbound_rules_detail || [];
            if (requiredInboundPolicy && inboundPolicy !== requiredInboundPolicy.toUpperCase()) fwViolations.push(`Firewall "${(fw as any).label}": inbound policy is ${inboundPolicy}, expected ${requiredInboundPolicy.toUpperCase()}`);
            if (requiredOutboundPolicy && outboundPolicy !== requiredOutboundPolicy.toUpperCase()) fwViolations.push(`Firewall "${(fw as any).label}": outbound policy is ${outboundPolicy}, expected ${requiredOutboundPolicy.toUpperCase()}`);
            for (const r of inboundRules) {
              if (r.action !== 'ACCEPT') continue;
              const protocol: string = (r.protocol || '').toUpperCase();
              if (protocol !== 'TCP' && protocol !== 'ALL') continue;
              const ipv4: string[] = r.addresses?.ipv4 || [];
              const ipv6: string[] = r.addresses?.ipv6 || [];
              const isOpenToAll = ipv4.includes('0.0.0.0/0') || ipv6.includes('::/0') || ipv6.includes('2000::/3');
              const portRanges: string = r.ports || '';
              if (blockedPorts.length > 0) {
                for (const p of blockedPorts) {
                  const portMatches = protocol === 'ALL' || portRanges === '' || portRanges.split(',').some((seg: string) => {
                    const s = seg.trim();
                    if (s.includes('-')) { const [lo, hi] = s.split('-').map(Number); return p >= lo && p <= hi; }
                    return parseInt(s, 10) === p;
                  });
                  if (portMatches) fwViolations.push(`Firewall "${(fw as any).label}": port ${p} is allowed inbound (rule: ${r.label || 'unnamed'})`);
                }
              }
              if (requireNoOpenPorts && isOpenToAll) fwViolations.push(`Firewall "${(fw as any).label}": rule "${r.label || 'unnamed'}" allows unrestricted inbound traffic`);
              if (allowedSourceIPs.length > 0 && !isOpenToAll) {
                const allIPs = [...ipv4, ...ipv6];
                const hasDisallowed = allIPs.some((ip: string) => !allowedSourceIPs.includes(ip));
                if (hasDisallowed) fwViolations.push(`Firewall "${(fw as any).label}": rule "${r.label || 'unnamed'}" allows traffic from IPs not in the allowed list`);
              }
            }
          }
          if (fwViolations.length > 0) { status = 'non_compliant'; detail = fwViolations.join('; '); }
          else { status = 'compliant'; detail = `Firewall rules compliant (${allFwResources.map((fw: any) => fw.label).join(', ')})`; }
          break;
        }
        case 'approved_regions': {
          const approvedRegions: string[] = rule.condition_config?.approved_regions || [];
          const resourceRegion: string = resource.region || '';
          if (approvedRegions.length === 0) { status = 'not_applicable'; detail = 'No approved regions configured for this rule.'; }
          else if (!resourceRegion) { status = 'not_applicable'; detail = 'Resource has no region information.'; }
          else if (approvedRegions.includes(resourceRegion)) { status = 'compliant'; detail = `Region "${resourceRegion}" is approved.`; }
          else { status = 'non_compliant'; detail = `Region "${resourceRegion}" is not in the approved list: ${approvedRegions.join(', ')}.`; }
          break;
        }
        case 'db_public_access': {
          const publicAccess: boolean | null = resource.specs?.public_access ?? null;
          if (publicAccess === null) { status = 'not_applicable'; detail = 'Public access data not available. Re-sync to fetch the latest database settings.'; break; }
          const allowPublicAccess: boolean = rule.condition_config?.allow_public_access ?? false;
          if (publicAccess && !allowPublicAccess) { status = 'non_compliant'; detail = 'Database has public access enabled — it is reachable outside the VPC.'; }
          else if (!publicAccess) { status = 'compliant'; detail = 'Database does not have public access enabled.'; }
          else { status = 'compliant'; detail = 'Database has public access enabled (permitted by rule configuration).'; }
          break;
        }
        case 'db_allowlist_check': {
          const allowList: string[] = resource.specs?.allow_list ?? [];
          if (allowList === null || resource.specs?.allow_list === undefined) { status = 'not_applicable'; detail = 'Allow list data not available. Re-sync to fetch the latest database settings.'; break; }
          const forbiddenCidrs: string[] = rule.condition_config?.forbidden_cidrs || ['0.0.0.0/0', '::/0'];
          const requireNonEmpty: boolean = rule.condition_config?.require_non_empty ?? false;
          const violations: string[] = [];
          if (requireNonEmpty && allowList.length === 0) violations.push('Allow list is empty — all IPs are permitted by default.');
          for (const cidr of allowList) {
            if (forbiddenCidrs.includes(cidr)) violations.push(`Unrestricted CIDR "${cidr}" is in the allow list.`);
          }
          if (violations.length > 0) { status = 'non_compliant'; detail = violations.join(' '); }
          else {
            status = 'compliant';
            detail = allowList.length === 0
              ? 'Allow list is empty (access restricted by default for this database).'
              : `Allow list contains ${allowList.length} entr${allowList.length === 1 ? 'y' : 'ies'}: ${allowList.join(', ')}.`;
          }
          break;
        }
        case 'linode_backups_enabled': {
          const backupsEnabled: boolean | null = resource.specs?.backups_enabled ?? null;
          if (backupsEnabled === null) { status = 'not_applicable'; detail = 'Backup status not available. Re-sync to fetch the latest instance data.'; }
          else if (backupsEnabled) { status = 'compliant'; detail = 'Backups are enabled for this Linode.'; }
          else { status = 'non_compliant'; detail = 'Backups are not enabled for this Linode.'; }
          break;
        }
        case 'linode_backup_recency': {
          const lastSuccessful: string | null = resource.specs?.backups_last_successful ?? null;
          const backupsEnabled: boolean = resource.specs?.backups_enabled ?? false;
          const maxAgeDays: number = rule.condition_config?.max_age_days ?? 7;
          if (!backupsEnabled) { status = 'non_compliant'; detail = 'Backups are not enabled for this Linode, so no recent recovery point exists.'; }
          else if (!lastSuccessful) { status = 'non_compliant'; detail = 'Backups are enabled but no successful backup has been recorded yet. Re-sync to refresh data.'; }
          else {
            const lastBackupMs = new Date(lastSuccessful).getTime();
            const ageHours = (Date.now() - lastBackupMs) / (1000 * 60 * 60);
            const ageDays = ageHours / 24;
            const lastBackupFormatted = new Date(lastSuccessful).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            if (ageDays <= maxAgeDays) { status = 'compliant'; detail = `Last successful backup was ${ageHours < 24 ? `${Math.round(ageHours)}h ago` : `${Math.round(ageDays)} day(s) ago`} (${lastBackupFormatted}), within the ${maxAgeDays}-day window.`; }
            else { status = 'non_compliant'; detail = `Last successful backup was ${Math.round(ageDays)} day(s) ago (${lastBackupFormatted}), which exceeds the required ${maxAgeDays}-day window.`; }
          }
          break;
        }
        case 'linode_disk_encryption': {
          const diskEncryption: string | null = resource.specs?.disk_encryption ?? null;
          if (diskEncryption === null) { status = 'not_applicable'; detail = 'Disk encryption status not available. Re-sync to fetch the latest instance data.'; }
          else if (diskEncryption === 'enabled') { status = 'compliant'; detail = 'Disk encryption is enabled for this Linode.'; }
          else { status = 'non_compliant'; detail = `Disk encryption is "${diskEncryption}". It must be set to "enabled".`; }
          break;
        }
        case 'linode_lock_configured': {
          const locks: string[] = resource.specs?.locks || [];
          const requiredLockTypes: string[] = rule.condition_config?.required_lock_types || [];
          if (locks.length === 0) { status = 'non_compliant'; detail = requiredLockTypes.length > 0 ? `No lock configured. Required: ${requiredLockTypes.join(', ')}.` : 'No deletion lock is configured for this Linode.'; }
          else if (requiredLockTypes.length > 0) {
            const missing = requiredLockTypes.filter((t: string) => !locks.includes(t));
            if (missing.length > 0) { status = 'non_compliant'; detail = `Lock(s) present (${locks.join(', ')}) but missing required type(s): ${missing.join(', ')}.`; }
            else { status = 'compliant'; detail = `Required lock(s) configured: ${locks.join(', ')}.`; }
          } else { status = 'compliant'; detail = `Deletion lock is configured: ${locks.join(', ')}.`; }
          break;
        }
        case 'linode_not_offline': {
          const linodeStatus: string = resource.specs?.status || '';
          if (!linodeStatus) { status = 'not_applicable'; detail = 'Instance status not available. Re-sync to fetch the latest data.'; }
          else if (linodeStatus === 'offline') { status = 'non_compliant'; detail = 'Linode is offline.'; }
          else { status = 'compliant'; detail = `Linode status is "${linodeStatus}".`; }
          break;
        }
        case 'nodebalancer_protocol_check': {
          const nbPortConfigs: any[] = resource.specs?.configs || [];
          if (nbPortConfigs.length === 0) { status = 'not_applicable'; detail = 'No port configurations found. Re-sync to fetch the latest NodeBalancer data.'; break; }
          const allowedProtocols: string[] = rule.condition_config?.allowed_protocols || [];
          const forbiddenProtocols: string[] = rule.condition_config?.forbidden_protocols || [];
          const violations: string[] = [];
          for (const cfg of nbPortConfigs) {
            const proto = (cfg.protocol || '').toLowerCase();
            if (forbiddenProtocols.length > 0 && forbiddenProtocols.includes(proto)) violations.push(`Port ${cfg.port} uses forbidden protocol "${proto}"`);
            else if (allowedProtocols.length > 0 && !allowedProtocols.includes(proto)) violations.push(`Port ${cfg.port} uses disallowed protocol "${proto}" (allowed: ${allowedProtocols.join(', ')})`);
          }
          if (violations.length > 0) { status = 'non_compliant'; detail = violations.join('; ') + '.'; }
          else { status = 'compliant'; detail = `All port configurations use compliant protocols: ${nbPortConfigs.map((c: any) => `port ${c.port} (${c.protocol})`).join(', ')}.`; }
          break;
        }
        case 'volume_encryption_enabled': {
          const volEncryption: string | null = resource.specs?.encryption ?? null;
          if (volEncryption === null) { status = 'not_applicable'; detail = 'Encryption status not available. Re-sync to fetch the latest volume data.'; }
          else if (volEncryption === 'enabled') { status = 'compliant'; detail = 'Disk encryption is enabled for this volume.'; }
          else { status = 'non_compliant'; detail = `Disk encryption is "${volEncryption}". It must be set to "enabled" to protect data at rest.`; }
          break;
        }
        case 'nodebalancer_port_allowlist': {
          const nbPortConfigs: any[] = resource.specs?.configs || [];
          if (nbPortConfigs.length === 0) { status = 'not_applicable'; detail = 'No port configurations found. Re-sync to fetch the latest NodeBalancer data.'; break; }
          const allowedPorts: number[] = rule.condition_config?.allowed_ports || [];
          if (allowedPorts.length === 0) { status = 'not_applicable'; detail = 'No allowed ports configured for this rule.'; break; }
          const portViolations: string[] = [];
          for (const cfg of nbPortConfigs) {
            if (!allowedPorts.includes(cfg.port)) portViolations.push(`Port ${cfg.port} is not in the allowed list`);
          }
          if (portViolations.length > 0) { status = 'non_compliant'; detail = portViolations.join('; ') + `. Allowed: ${allowedPorts.join(', ')}.`; }
          else { status = 'compliant'; detail = `All configured ports (${nbPortConfigs.map((c: any) => `${c.port}`).join(', ')}) are in the allowed list.`; }
          break;
        }
        case 'firewall_rfc1918_lateral': {
          const sensitivePorts: number[] = rule.condition_config?.sensitive_ports || [22, 3389, 3306, 5432, 5984, 6379, 9200, 27017];
          const inboundRules: any[] = resource.specs?.inbound_rules_detail || [];
          const privateRanges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
          function isRfc1918(cidr: string): boolean {
            return privateRanges.includes(cidr) || cidr.startsWith('10.') ||
              (cidr.startsWith('172.') && (() => { const s = parseInt(cidr.split('.')[1], 10); return s >= 16 && s <= 31; })()) ||
              cidr.startsWith('192.168.');
          }
          const violations: string[] = [];
          for (const r of inboundRules) {
            if (r.action !== 'ACCEPT') continue;
            const protocol: string = (r.protocol || '').toUpperCase();
            if (protocol !== 'TCP' && protocol !== 'ALL') continue;
            const ipv4: string[] = r.addresses?.ipv4 || [];
            const privateSourceIps = ipv4.filter(isRfc1918);
            if (privateSourceIps.length === 0) continue;
            const portRanges: string = r.ports || '';
            for (const p of sensitivePorts) {
              const portMatches = protocol === 'ALL' || portRanges === '' || portRanges.split(',').some((seg: string) => {
                const s = seg.trim();
                if (s.includes('-')) { const [lo, hi] = s.split('-').map(Number); return p >= lo && p <= hi; }
                return parseInt(s, 10) === p;
              });
              if (portMatches) violations.push(`Rule "${r.label || 'unnamed'}": port ${p} accepts traffic from private range(s) ${privateSourceIps.join(', ')}`);
            }
          }
          if (violations.length > 0) { status = 'non_compliant'; detail = `Potential lateral movement: ${violations.join('; ')}.`; }
          else if (inboundRules.length === 0) { status = 'not_applicable'; detail = 'No inbound rules to evaluate.'; }
          else { status = 'compliant'; detail = 'No inbound rules accept RFC-1918 traffic on sensitive ports.'; }
          break;
        }
        case 'firewall_rule_descriptions': {
          const inboundRules: any[] = resource.specs?.inbound_rules_detail || [];
          const outboundRules: any[] = resource.specs?.outbound_rules_detail || [];
          const allRules = [...inboundRules, ...outboundRules];
          if (allRules.length === 0) { status = 'not_applicable'; detail = 'No rules to evaluate.'; break; }
          const undescribed = allRules.filter((r: any) => !r.description || r.description.trim() === '');
          if (undescribed.length > 0) { status = 'non_compliant'; detail = `${undescribed.length} rule${undescribed.length !== 1 ? 's are' : ' is'} missing a description: ${undescribed.map((r: any) => `"${r.label || 'unnamed'}"`).join(', ')}.`; }
          else { status = 'compliant'; detail = `All ${allRules.length} rule${allRules.length !== 1 ? 's' : ''} have descriptions set.`; }
          break;
        }
        case 'firewall_no_duplicate_rules': {
          const inboundRules: any[] = resource.specs?.inbound_rules_detail || [];
          const outboundRules: any[] = resource.specs?.outbound_rules_detail || [];
          function ruleFingerprint(r: any): string {
            const ipv4 = [...(r.addresses?.ipv4 || [])].sort().join(',');
            const ipv6 = [...(r.addresses?.ipv6 || [])].sort().join(',');
            return `${(r.action || '').toUpperCase()}|${(r.protocol || '').toUpperCase()}|${r.ports || ''}|${ipv4}|${ipv6}`;
          }
          const duplicates: string[] = [];
          function findDuplicates(rules: any[], direction: string) {
            const seen = new Map<string, string>();
            for (const r of rules) {
              const fp = ruleFingerprint(r);
              const label = r.label || 'unnamed';
              if (seen.has(fp)) duplicates.push(`${direction} rule "${label}" is identical to "${seen.get(fp)}"`);
              else seen.set(fp, label);
            }
          }
          findDuplicates(inboundRules, 'Inbound');
          findDuplicates(outboundRules, 'Outbound');
          if (inboundRules.length === 0 && outboundRules.length === 0) { status = 'not_applicable'; detail = 'No rules to evaluate.'; }
          else if (duplicates.length > 0) { status = 'non_compliant'; detail = `Duplicate rules detected: ${duplicates.join('; ')}.`; }
          else { const total = inboundRules.length + outboundRules.length; status = 'compliant'; detail = `No duplicate rules found across ${total} rule${total !== 1 ? 's' : ''}.`; }
          break;
        }
        case 'firewall_all_ports_allowed': {
          const inboundRules: any[] = resource.specs?.inbound_rules_detail || [];
          const outboundRules: any[] = resource.specs?.outbound_rules_detail || [];
          const checkInbound: boolean = rule.condition_config?.check_inbound ?? true;
          const checkOutbound: boolean = rule.condition_config?.check_outbound ?? false;
          const actionsToCheck: string[] = (rule.condition_config?.actions || ['ACCEPT']).map((a: string) => a.toUpperCase());
          const violations: string[] = [];
          const SKIP_PROTOCOLS = new Set(['ICMP', 'IPENCAP']);
          function isAllPorts(r: any): boolean {
            const protocol: string = (r.protocol || '').toUpperCase();
            if (SKIP_PROTOCOLS.has(protocol)) return false;
            if (protocol === 'ALL') return true;
            const ports: string = (r.ports || '').trim();
            return ports === '' || ports === '1-65535';
          }
          if (checkInbound) {
            for (const r of inboundRules) {
              if (!actionsToCheck.includes((r.action || '').toUpperCase())) continue;
              if (isAllPorts(r)) violations.push(`Inbound rule "${r.label || 'unnamed'}": allows all ports (protocol: ${(r.protocol || 'ALL').toUpperCase()}, ports: "${r.ports || 'any'}")`);
            }
          }
          if (checkOutbound) {
            for (const r of outboundRules) {
              if (!actionsToCheck.includes((r.action || '').toUpperCase())) continue;
              if (isAllPorts(r)) violations.push(`Outbound rule "${r.label || 'unnamed'}": allows all ports (protocol: ${(r.protocol || 'ALL').toUpperCase()}, ports: "${r.ports || 'any'}")`);
            }
          }
          const totalChecked = (checkInbound ? inboundRules.length : 0) + (checkOutbound ? outboundRules.length : 0);
          if (totalChecked === 0) { status = 'not_applicable'; detail = 'No rules to evaluate.'; }
          else if (violations.length > 0) { status = 'non_compliant'; detail = violations.join('; '); }
          else { status = 'compliant'; detail = `No rules allow all ports across ${totalChecked} rule${totalChecked !== 1 ? 's' : ''} checked.`; }
          break;
        }
        case 'linode_plan_tier_by_tag': {
          const tagKey: string = (rule.condition_config?.tag || '').toLowerCase();
          const tagValue: string = (rule.condition_config?.tag_value || '').toLowerCase();
          const approvedTiers: string[] = rule.condition_config?.approved_tiers || [];
          if (!tagKey || approvedTiers.length === 0) { status = 'not_applicable'; detail = 'Rule is not fully configured (tag key or approved tiers missing).'; break; }
          const tags: string[] = resource.specs?.tags || [];
          const matchingTag = tags.find((t: string) => {
            const tLower = t.toLowerCase();
            if (tagValue) return tLower === `${tagKey}:${tagValue}` || (tLower === tagKey && !tagValue);
            return tLower === tagKey || tLower.startsWith(`${tagKey}:`);
          });
          if (!matchingTag) { status = 'not_applicable'; detail = `Linode does not have the tag "${tagKey}${tagValue ? `:${tagValue}` : ''}" — rule does not apply.`; break; }
          const planType: string = resource.plan_type || '';
          const tierFromPlan = planType.replace(/^g\d+-/, '').replace(/-\d+$/, '');
          const isApproved = approvedTiers.some((tier: string) => tierFromPlan.startsWith(tier));
          if (isApproved) { status = 'compliant'; detail = `Plan "${planType}" (tier: ${tierFromPlan}) is in the approved tiers: ${approvedTiers.join(', ')}.`; }
          else { status = 'non_compliant'; detail = `Plan "${planType}" (tier: ${tierFromPlan}) is not in the approved tiers: ${approvedTiers.join(', ')}. Upgrade to a ${approvedTiers.join(' or ')} instance.`; }
          break;
        }
        default:
          status = 'not_applicable';
          detail = 'Rule condition not recognized.';
      }

      results.push({ rule_id: rule.id, resource_id: resource.id, account_id: accountId, status, detail, evaluated_at: evaluatedAt });
    }
  }

  for (const rule of compositeRules) {
    const cfg = rule.condition_config || {};
    const operator: string = cfg.operator || 'AND';
    const ruleIds: string[] = cfg.rule_ids || [];
    const ifRuleId: string | null = cfg.if_rule_id || null;
    const thenRuleId: string | null = cfg.then_rule_id || null;

    if (operator === 'IF_THEN') {
      const ifRule = rules.find((r: any) => r.id === ifRuleId);
      const thenRule = rules.find((r: any) => r.id === thenRuleId);
      if (!ifRule || !thenRule) { results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'IF_THEN composite rule references missing sub-rules.', evaluated_at: evaluatedAt }); continue; }
      const allResourceIds = new Set([
        ...results.filter((r: any) => r.rule_id === ifRuleId && r.resource_id).map((r: any) => r.resource_id),
        ...results.filter((r: any) => r.rule_id === thenRuleId && r.resource_id).map((r: any) => r.resource_id),
      ]);
      if (allResourceIds.size === 0) { results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No resources to evaluate for IF_THEN composite rule.', evaluated_at: evaluatedAt }); continue; }
      for (const rid of allResourceIds) {
        const ifResult = results.find((r: any) => r.rule_id === ifRuleId && r.resource_id === rid);
        const thenResult = results.find((r: any) => r.rule_id === thenRuleId && r.resource_id === rid);
        const ifTriggered = ifResult?.status === 'non_compliant';
        const thenPassed = thenResult?.status === 'compliant';
        if (!ifTriggered) results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: 'not_applicable', detail: `IF condition (${ifRule.name}) not triggered — rule does not apply.`, evaluated_at: evaluatedAt });
        else if (thenPassed) results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: 'compliant', detail: `IF condition (${ifRule.name}) triggered and THEN condition (${thenRule.name}) is satisfied.`, evaluated_at: evaluatedAt });
        else results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: 'non_compliant', detail: `IF condition (${ifRule.name}) triggered but THEN condition (${thenRule.name}) failed.`, evaluated_at: evaluatedAt });
      }
      continue;
    }

    if (operator === 'NOT') {
      const targetId = ruleIds[0];
      if (!targetId) { results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'NOT composite rule has no sub-rule specified.', evaluated_at: evaluatedAt }); continue; }
      const targetResults = results.filter((r: any) => r.rule_id === targetId);
      if (targetResults.length === 0) { results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No results found for sub-rule.', evaluated_at: evaluatedAt }); continue; }
      for (const sub of targetResults) {
        const flipped = sub.status === 'compliant' ? 'non_compliant' : sub.status === 'non_compliant' ? 'compliant' : 'not_applicable';
        results.push({ rule_id: rule.id, resource_id: sub.resource_id, account_id: accountId, status: flipped, detail: `NOT(${sub.detail})`, evaluated_at: evaluatedAt });
      }
      continue;
    }

    const subResults = results.filter((r: any) => ruleIds.includes(r.rule_id));
    const allResourceIds = new Set(subResults.filter((r: any) => r.resource_id).map((r: any) => r.resource_id));
    const accountLevelSubResults = subResults.filter((r: any) => !r.resource_id);

    if (allResourceIds.size === 0 && accountLevelSubResults.length === 0) { results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No sub-rule results to combine.', evaluated_at: evaluatedAt }); continue; }

    if (allResourceIds.size > 0) {
      for (const rid of allResourceIds) {
        const subForResource = ruleIds.map((subId: string) => results.find((r: any) => r.rule_id === subId && r.resource_id === rid));
        const statuses = subForResource.map((r: any) => r?.status ?? 'not_applicable');
        const subRuleNames = ruleIds.map((id: string) => rules.find((r: any) => r.id === id)?.name ?? id);
        let combinedStatus: string;
        let compDetail: string;
        if (operator === 'AND') {
          combinedStatus = statuses.every((s: string) => s === 'compliant') ? 'compliant' : statuses.some((s: string) => s === 'non_compliant') ? 'non_compliant' : 'not_applicable';
          compDetail = statuses.every((s: string) => s === 'compliant') ? `All conditions passed: ${subRuleNames.join(', ')}` : `AND failed — sub-rule statuses: ${subRuleNames.map((n: string, i: number) => `${n}: ${statuses[i]}`).join('; ')}`;
        } else {
          combinedStatus = statuses.some((s: string) => s === 'compliant') ? 'compliant' : statuses.every((s: string) => s === 'not_applicable') ? 'not_applicable' : 'non_compliant';
          compDetail = statuses.some((s: string) => s === 'compliant') ? `OR passed — at least one condition met: ${subRuleNames.join(', ')}` : `OR failed — no conditions met: ${subRuleNames.map((n: string, i: number) => `${n}: ${statuses[i]}`).join('; ')}`;
        }
        results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: combinedStatus, detail: compDetail, evaluated_at: evaluatedAt });
      }
    } else {
      const statuses = accountLevelSubResults.map((r: any) => r.status);
      const subRuleNames = ruleIds.map((id: string) => rules.find((r: any) => r.id === id)?.name ?? id);
      let combinedStatus: string;
      let compDetail: string;
      if (operator === 'AND') {
        combinedStatus = statuses.every((s: string) => s === 'compliant') ? 'compliant' : statuses.some((s: string) => s === 'non_compliant') ? 'non_compliant' : 'not_applicable';
        compDetail = `AND: ${subRuleNames.map((n: string, i: number) => `${n}: ${statuses[i]}`).join('; ')}`;
      } else {
        combinedStatus = statuses.some((s: string) => s === 'compliant') ? 'compliant' : statuses.every((s: string) => s === 'not_applicable') ? 'not_applicable' : 'non_compliant';
        compDetail = `OR: ${subRuleNames.map((n: string, i: number) => `${n}: ${statuses[i]}`).join('; ')}`;
      }
      results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: combinedStatus, detail: compDetail, evaluated_at: evaluatedAt });
    }
  }

  const resultsWithAcks = results.map((r: any) => {
    const key = `${r.rule_id}:${r.resource_id ?? ''}`;
    const ack = ackMap.get(key);
    if (ack) return { ...r, acknowledged: true, acknowledged_at: ack.acknowledged_at, acknowledged_note: ack.acknowledged_note, acknowledged_by: ack.acknowledged_by };
    return { ...r, acknowledged: false, acknowledged_at: null, acknowledged_note: null, acknowledged_by: null };
  });

  if (resultsWithAcks.length > 0) {
    const { error: insertError } = await supabase.from('compliance_results').insert(resultsWithAcks);
    if (insertError) throw insertError;
  }

  await supabase.from('linode_accounts').update({ last_evaluated_at: evaluatedAt }).eq('id', accountId);

  const unacknowledged = resultsWithAcks.filter((r: any) => !r.acknowledged);
  const compliant = unacknowledged.filter((r: any) => r.status === 'compliant').length;
  const nonCompliant = unacknowledged.filter((r: any) => r.status === 'non_compliant').length;
  const notApplicable = unacknowledged.filter((r: any) => r.status === 'not_applicable').length;
  const acknowledged = resultsWithAcks.filter((r: any) => r.acknowledged).length;
  const scoreable = compliant + nonCompliant;
  const complianceScore = scoreable > 0 ? Math.round((compliant / scoreable) * 10000) / 100 : null;

  const ruleBreakdown = rules.map((rule: any) => {
    const ruleResults = unacknowledged.filter((r: any) => r.rule_id === rule.id);
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      compliant: ruleResults.filter((r: any) => r.status === 'compliant').length,
      non_compliant: ruleResults.filter((r: any) => r.status === 'non_compliant').length,
      not_applicable: ruleResults.filter((r: any) => r.status === 'not_applicable').length,
    };
  });

  await supabase.from('compliance_score_history').insert({
    account_id: accountId,
    evaluated_at: evaluatedAt,
    total_results: unacknowledged.length,
    compliant_count: compliant,
    non_compliant_count: nonCompliant,
    not_applicable_count: notApplicable,
    acknowledged_count: acknowledged,
    compliance_score: complianceScore,
    total_rules_evaluated: rules.length,
    rule_breakdown: ruleBreakdown,
  });

  const resourceIds = Array.from(new Set(
    resultsWithAcks.filter((r: any) => r.resource_id != null).map((r: any) => r.resource_id as string)
  ));
  if (resourceIds.length > 0) {
    const ruleNameMap = new Map(rules.map((r: any) => [r.id, { name: r.name, severity: r.severity }]));
    const perResourceRows = resourceIds.map((resourceId: string) => {
      const resResults = resultsWithAcks.filter((r: any) => r.resource_id === resourceId);
      return {
        account_id: accountId,
        resource_id: resourceId,
        evaluated_at: evaluatedAt,
        results: resResults.map((r: any) => ({
          rule_id: r.rule_id,
          rule_name: (ruleNameMap.get(r.rule_id) as any)?.name ?? '',
          severity: (ruleNameMap.get(r.rule_id) as any)?.severity ?? 'info',
          status: r.status,
          detail: r.detail ?? null,
          acknowledged: r.acknowledged,
        })),
      };
    });
    await supabase.from('resource_compliance_history').insert(perResourceRows);
  }

  return { evaluated: resultsWithAcks.length, compliant, non_compliant: nonCompliant };
}
