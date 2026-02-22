import { supabase } from './supabase.js';

export async function fetchLinodeResources(accountId: string, onProgress?: (msg: string) => void) {
  const { data: account, error: accountError } = await supabase
    .from('linode_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (accountError || !account) throw new Error('Account not found');

  const apiToken = account.api_token;
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  const resources: any[] = [];

  onProgress?.('Fetching instances...');
  const linodesRes = await fetch('https://api.linode.com/v4/linode/instances', { headers });
  if (linodesRes.ok) {
    const linodesData = await linodesRes.json();
    for (const instance of linodesData.data || []) {
      const typeRes = await fetch(`https://api.linode.com/v4/linode/types/${instance.type}`, { headers });
      let price = 0;
      if (typeRes.ok) {
        const typeData = await typeRes.json();
        price = typeData.price?.monthly || typeData.monthly_price || 0;
      }

      let attachedFirewalls: any[] = [];
      try {
        const fwRes = await fetch(`https://api.linode.com/v4/linode/instances/${instance.id}/firewalls`, { headers });
        if (fwRes.ok) {
          const fwData = await fwRes.json();
          attachedFirewalls = (fwData.data || []).map((fw: any) => ({
            id: fw.id,
            label: fw.label,
            status: fw.status,
          }));
        }
      } catch { /* ignore */ }

      resources.push({
        account_id: accountId,
        resource_id: instance.id.toString(),
        resource_type: 'linode',
        label: instance.label,
        region: instance.region,
        plan_type: instance.type,
        monthly_cost: price,
        status: instance.status,
        resource_created_at: instance.created || null,
        specs: {
          vcpus: instance.specs.vcpus,
          memory: instance.specs.memory,
          disk: instance.specs.disk,
          transfer: instance.specs.transfer,
          gpus: instance.specs.gpus || 0,
          tags: instance.tags || [],
          attached_firewalls: attachedFirewalls,
          backups_enabled: instance.backups?.enabled ?? false,
          backups_last_successful: instance.backups?.last_successful ?? null,
          backups_available: instance.backups?.available ?? false,
          disk_encryption: instance.disk_encryption ?? null,
          locks: instance.locks || [],
          status: instance.status || null,
        },
      });
    }
  }

  onProgress?.('Fetching volumes...');
  const volumesRes = await fetch('https://api.linode.com/v4/volumes', { headers });
  if (volumesRes.ok) {
    const volumesData = await volumesRes.json();
    for (const volume of volumesData.data || []) {
      resources.push({
        account_id: accountId,
        resource_id: volume.id.toString(),
        resource_type: 'volume',
        label: volume.label,
        region: volume.region,
        monthly_cost: volume.size * 0.10,
        status: volume.status,
        resource_created_at: volume.created || null,
        specs: {
          size: volume.size,
          tags: volume.tags || [],
          linode_id: volume.linode_id || null,
          linode_label: volume.linode_label || null,
          filesystem_path: volume.filesystem_path || null,
          encryption: volume.encryption || null,
        },
      });
    }
  }

  onProgress?.('Fetching NodeBalancers...');
  const nbRes = await fetch('https://api.linode.com/v4/nodebalancers', { headers });
  if (nbRes.ok) {
    const nbData = await nbRes.json();
    for (const nb of nbData.data || []) {
      let nodeCount = 0;
      let nbNodes: any[] = [];
      let nbConfigs: any[] = [];
      try {
        const configsRes = await fetch(`https://api.linode.com/v4/nodebalancers/${nb.id}/configs`, { headers });
        if (configsRes.ok) {
          const configsData = await configsRes.json();
          const configs = configsData.data || [];
          nbConfigs = configs.map((config: any) => ({
            id: config.id,
            port: config.port,
            protocol: config.protocol,
            algorithm: config.algorithm,
            stickiness: config.stickiness,
            check: config.check,
            check_interval: config.check_interval,
            check_timeout: config.check_timeout,
            check_attempts: config.check_attempts,
            check_passive: config.check_passive,
            cipher_suite: config.cipher_suite,
            proxy_protocol: config.proxy_protocol,
            nodes_status: config.nodes_status || { up: 0, down: 0 },
          }));
          const perConfigNodes = await Promise.all(
            configs.map(async (config: any) => {
              const nodesRes = await fetch(
                `https://api.linode.com/v4/nodebalancers/${nb.id}/configs/${config.id}/nodes`,
                { headers }
              );
              if (nodesRes.ok) {
                const nodesData = await nodesRes.json();
                return (nodesData.data || []).map((n: any) => ({
                  id: n.id,
                  label: n.label || '',
                  address: n.address || '',
                  status: n.status || 'unknown',
                  linode_id: n.linode_id ?? null,
                }));
              }
              return [];
            })
          );
          const seenIds = new Set<number>();
          for (const nodes of perConfigNodes) {
            for (const node of nodes) {
              if (!seenIds.has(node.id)) {
                seenIds.add(node.id);
                nbNodes.push(node);
              }
            }
          }
          nodeCount = nbNodes.length;
        }
      } catch { nodeCount = 0; }

      let nbVpcs: any[] = [];
      try {
        const nbVpcsRes = await fetch(`https://api.linode.com/v4/nodebalancers/${nb.id}/vpcs`, { headers });
        if (nbVpcsRes.ok) {
          const nbVpcsData = await nbVpcsRes.json();
          nbVpcs = (nbVpcsData.data || []).map((v: any) => ({
            vpc_id: v.vpc_id,
            subnet_id: v.subnet_id,
            ipv4_range: v.ipv4_range ?? null,
          }));
        }
      } catch { /* ignore */ }

      resources.push({
        account_id: accountId,
        resource_id: nb.id.toString(),
        resource_type: 'nodebalancer',
        label: nb.label,
        region: nb.region,
        monthly_cost: 10.00,
        status: 'active',
        resource_created_at: nb.created || null,
        specs: {
          ipv4: nb.ipv4,
          tags: nb.tags || [],
          node_count: nodeCount,
          nodes: nbNodes,
          configs: nbConfigs,
          vpcs: nbVpcs,
        },
      });
    }
  }

  onProgress?.('Fetching LKE clusters...');
  let lkeTypes: Record<string, { hourly: number; monthly: number }> = {};
  try {
    const lkeTypesRes = await fetch('https://api.linode.com/v4/lke/types', { headers });
    if (lkeTypesRes.ok) {
      const lkeTypesData = await lkeTypesRes.json();
      for (const t of lkeTypesData.data || []) {
        lkeTypes[t.id] = { hourly: t.price?.hourly || 0, monthly: t.price?.monthly || 0 };
      }
    }
  } catch { /* ignore */ }

  const lkeRes = await fetch('https://api.linode.com/v4/lke/clusters', { headers });
  if (lkeRes.ok) {
    const lkeData = await lkeRes.json();
    for (const cluster of lkeData.data || []) {
      let nodeCount = 0;
      let nodePools: any[] = [];
      let monthlyCost = 0;
      try {
        const poolsRes = await fetch(`https://api.linode.com/v4/lke/clusters/${cluster.id}/pools`, { headers });
        if (poolsRes.ok) {
          const poolsData = await poolsRes.json();
          nodePools = poolsData.data || [];
          for (const pool of nodePools) {
            nodeCount += pool.count || 0;
            const pricing = lkeTypes[pool.type];
            if (pricing) monthlyCost += pricing.monthly * (pool.count || 0);
          }
        }
      } catch { /* ignore */ }

      if (cluster.control_plane?.high_availability) {
        const haPricing = lkeTypes['lke-ha'];
        if (haPricing) monthlyCost += haPricing.monthly;
      }

      resources.push({
        account_id: accountId,
        resource_id: cluster.id.toString(),
        resource_type: 'lke_cluster',
        label: cluster.label,
        region: cluster.region,
        plan_type: cluster.k8s_version ? `k8s-${cluster.k8s_version}` : undefined,
        monthly_cost: monthlyCost,
        status: 'active',
        resource_created_at: cluster.created || null,
        specs: {
          k8s_version: cluster.k8s_version,
          node_count: nodeCount,
          pool_count: nodePools.length,
          high_availability: cluster.control_plane?.high_availability ?? false,
          audit_logs_enabled: cluster.control_plane?.audit_logs_enabled ?? null,
          tier: cluster.tier || 'standard',
          tags: cluster.tags || [],
          pools: nodePools.map((p: any) => ({ id: p.id, type: p.type, count: p.count })),
        },
      });
    }
  }

  onProgress?.('Fetching object storage...');
  let page = 1;
  let hasMorePages = true;
  const objectStorageBuckets: any[] = [];
  let totalObjectStorageSize = 0;

  while (hasMorePages) {
    const bucketsRes = await fetch(`https://api.linode.com/v4/object-storage/buckets?page=${page}`, { headers });
    if (bucketsRes.ok) {
      const bucketsData = await bucketsRes.json();
      for (const bucket of bucketsData.data || []) {
        const sizeInGB = bucket.size / (1024 * 1024 * 1024);
        totalObjectStorageSize += sizeInGB;

        let bucketAcl: string | null = null;
        let bucketCorsEnabled: boolean | null = null;
        try {
          const aclRes = await fetch(
            `https://api.linode.com/v4/object-storage/buckets/${bucket.region}/${bucket.label}/access`,
            { headers }
          );
          if (aclRes.ok) {
            const aclData = await aclRes.json();
            bucketAcl = aclData.acl ?? null;
            bucketCorsEnabled = aclData.cors_enabled ?? null;
          }
        } catch { /* ignore */ }

        objectStorageBuckets.push({
          account_id: accountId,
          resource_id: `${bucket.label}-${bucket.region}`,
          resource_type: 'object_storage',
          label: bucket.label,
          region: bucket.region,
          monthly_cost: 0,
          status: 'active',
          resource_created_at: bucket.created || null,
          specs: {
            hostname: bucket.hostname,
            endpoint_type: bucket.endpoint_type,
            objects: bucket.objects,
            size: sizeInGB,
            s3_endpoint: bucket.s3_endpoint,
            acl: bucketAcl,
            cors_enabled: bucketCorsEnabled,
          },
        });
      }
      hasMorePages = bucketsData.page < bucketsData.pages;
      page++;
    } else {
      hasMorePages = false;
    }
  }

  const objectStorageCost = totalObjectStorageSize <= 250
    ? (objectStorageBuckets.length > 0 ? 5 : 0)
    : 5 + (totalObjectStorageSize - 250) * 0.02;

  if (objectStorageBuckets.length > 0 && totalObjectStorageSize > 0) {
    objectStorageBuckets.forEach(bucket => {
      bucket.monthly_cost = (bucket.specs.size / totalObjectStorageSize) * objectStorageCost;
    });
  }

  resources.push(...objectStorageBuckets);

  onProgress?.('Fetching databases...');
  const dbTypePricing: Record<string, { mysql_monthly: number; postgresql_monthly: number }> = {};
  try {
    const dbTypesRes = await fetch('https://api.linode.com/v4/databases/types', { headers });
    if (dbTypesRes.ok) {
      const dbTypesData = await dbTypesRes.json();
      for (const t of dbTypesData.data || []) {
        dbTypePricing[t.id] = {
          mysql_monthly: t.engines?.mysql?.[0]?.price?.monthly ?? 0,
          postgresql_monthly: t.engines?.postgresql?.[0]?.price?.monthly ?? 0,
        };
      }
    }
  } catch { /* ignore */ }

  const dbRes = await fetch('https://api.linode.com/v4/databases/instances', { headers });
  if (dbRes.ok) {
    const dbData = await dbRes.json();
    for (const db of dbData.data || []) {
      const engine: string = db.engine || 'unknown';
      const pricing = dbTypePricing[db.type] ?? { mysql_monthly: 0, postgresql_monthly: 0 };
      const monthlyCost = engine === 'postgresql'
        ? pricing.postgresql_monthly * (db.cluster_size || 1)
        : pricing.mysql_monthly * (db.cluster_size || 1);

      let vpcId: number | null = null;
      let subnetId: number | null = null;
      let publicAccess: boolean | null = null;
      let allowList: string[] = db.allow_list || [];
      try {
        const dbEndpoint = engine === 'postgresql'
          ? `https://api.linode.com/v4/databases/postgresql/instances/${db.id}`
          : `https://api.linode.com/v4/databases/mysql/instances/${db.id}`;
        const dbDetailRes = await fetch(dbEndpoint, { headers });
        if (dbDetailRes.ok) {
          const dbDetail = await dbDetailRes.json();
          if (dbDetail.private_network) {
            vpcId = dbDetail.private_network.vpc_id ?? null;
            subnetId = dbDetail.private_network.subnet_id ?? null;
            publicAccess = dbDetail.private_network.public_access ?? null;
          }
          if (Array.isArray(dbDetail.allow_list)) allowList = dbDetail.allow_list;
        }
      } catch { /* ignore */ }

      resources.push({
        account_id: accountId,
        resource_id: db.id.toString(),
        resource_type: 'database',
        label: db.label,
        region: db.region,
        plan_type: db.type,
        monthly_cost: monthlyCost,
        status: db.status,
        resource_created_at: db.created || null,
        specs: {
          engine,
          version: db.version,
          cluster_size: db.cluster_size || 1,
          encrypted: db.encrypted || false,
          port: db.port,
          hosts: db.hosts,
          platform: db.platform || '',
          total_disk_size_gb: db.total_disk_size_gb,
          used_disk_size_gb: db.used_disk_size_gb,
          tags: db.tags || [],
          vpc_id: vpcId,
          subnet_id: subnetId,
          public_access: publicAccess,
          allow_list: allowList,
        },
      });
    }
  }

  onProgress?.('Fetching firewalls...');
  const firewallsRes = await fetch('https://api.linode.com/v4/networking/firewalls', { headers });
  if (firewallsRes.ok) {
    const firewallsData = await firewallsRes.json();
    for (const fw of firewallsData.data || []) {
      const inboundRules = fw.rules?.inbound || [];
      const outboundRules = fw.rules?.outbound || [];
      const entities = fw.entities || [];

      const linodeIdsSeen = new Set<number>();
      const linodeEntities: any[] = [];

      for (const e of entities) {
        if (e.type === 'linode' && e.id != null) {
          if (!linodeIdsSeen.has(e.id)) {
            linodeIdsSeen.add(e.id);
            linodeEntities.push({ id: e.id, label: e.label || '', via_interface: false });
          }
        } else if ((e.type === 'interface' || e.type === 'linode_interface') && e.parent_entity?.type === 'linode' && e.parent_entity.id != null) {
          const pid = e.parent_entity.id;
          if (!linodeIdsSeen.has(pid)) {
            linodeIdsSeen.add(pid);
            linodeEntities.push({ id: pid, label: e.parent_entity.label || '', via_interface: true });
          }
        }
      }

      resources.push({
        account_id: accountId,
        resource_id: fw.id.toString(),
        resource_type: 'firewall',
        label: fw.label,
        region: null,
        plan_type: null,
        monthly_cost: 0,
        status: fw.status,
        resource_created_at: fw.created || null,
        specs: {
          inbound_policy: fw.rules?.inbound_policy || 'ACCEPT',
          outbound_policy: fw.rules?.outbound_policy || 'ACCEPT',
          inbound_rules: inboundRules.length,
          outbound_rules: outboundRules.length,
          inbound_rules_detail: inboundRules,
          outbound_rules_detail: outboundRules,
          entity_count: linodeEntities.length,
          entities: linodeEntities,
          tags: fw.tags || [],
        },
      });
    }
  }

  onProgress?.('Fetching VPCs...');
  const vpcsRes = await fetch('https://api.linode.com/v4/vpcs', { headers });
  if (vpcsRes.ok) {
    const vpcsData = await vpcsRes.json();
    for (const vpc of vpcsData.data || []) {
      const subnets = vpc.subnets || [];
      const linodeIds = new Set<number>();
      for (const subnet of subnets) {
        for (const l of subnet.linodes || []) {
          if (l.id != null) linodeIds.add(l.id);
        }
      }
      resources.push({
        account_id: accountId,
        resource_id: vpc.id.toString(),
        resource_type: 'vpc',
        label: vpc.label,
        region: vpc.region,
        plan_type: null,
        monthly_cost: 0,
        status: 'active',
        resource_created_at: vpc.created || null,
        specs: {
          description: vpc.description || '',
          subnet_count: subnets.length,
          subnets: subnets.map((s: any) => ({
            id: s.id,
            label: s.label,
            ipv4: s.ipv4,
            linode_count: (s.linodes || []).length,
            linode_ids: (s.linodes || []).map((l: any) => l.id),
          })),
          linode_count: linodeIds.size,
          linode_ids: Array.from(linodeIds),
        },
      });
    }
  }

  onProgress?.('Saving resources...');
  const { data: existingResources } = await supabase
    .from('resources')
    .select('*')
    .eq('account_id', accountId);

  const existingByResourceId: Record<string, any> = {};
  for (const r of existingResources || []) {
    existingByResourceId[`${r.resource_type}:${r.resource_id}`] = r;
  }

  await supabase.from('resources').delete().eq('account_id', accountId);

  if (resources.length > 0) {
    const { error: insertError } = await supabase.from('resources').insert(resources);
    if (insertError) throw insertError;
  }

  const { data: newResources } = await supabase
    .from('resources')
    .select('*')
    .eq('account_id', accountId);

  const syncedAt = new Date().toISOString();

  const snapshots: any[] = [];
  for (const nr of newResources || []) {
    const key = `${nr.resource_type}:${nr.resource_id}`;
    const prev = existingByResourceId[key];
    let diff: Record<string, { from: any; to: any }> | null = null;

    if (prev) {
      diff = {};
      const fields = ['label', 'status', 'region', 'plan_type', 'monthly_cost'];
      for (const f of fields) {
        if (JSON.stringify(prev[f]) !== JSON.stringify(nr[f])) {
          diff[f] = { from: prev[f], to: nr[f] };
        }
      }
      if (JSON.stringify(prev.specs || {}) !== JSON.stringify(nr.specs || {})) {
        diff['specs'] = { from: prev.specs, to: nr.specs };
      }
      if (Object.keys(diff).length === 0) diff = null;
    }

    snapshots.push({
      resource_id: nr.id,
      account_id: accountId,
      resource_type: nr.resource_type,
      label: nr.label,
      region: nr.region,
      plan_type: nr.plan_type,
      monthly_cost: nr.monthly_cost,
      status: nr.status,
      specs: nr.specs,
      diff,
      synced_at: syncedAt,
    });
  }

  if (snapshots.length > 0) {
    await supabase.from('resource_snapshots').insert(snapshots);
  }

  onProgress?.('Mapping relationships...');
  await supabase.from('resource_relationships').delete().eq('account_id', accountId);

  const relationships: any[] = [];
  const resourcesByTypeAndId: Record<string, any> = {};
  for (const nr of newResources || []) {
    resourcesByTypeAndId[`${nr.resource_type}:${nr.resource_id}`] = nr;
  }

  const fwLinodePairs = new Set<string>();
  for (const nr of newResources || []) {
    if (nr.resource_type === 'linode' && nr.specs?.attached_firewalls?.length > 0) {
      for (const fw of nr.specs.attached_firewalls) {
        const firewall = resourcesByTypeAndId[`firewall:${fw.id}`];
        if (firewall) fwLinodePairs.add(`${firewall.id}:${nr.id}`);
      }
    }
    if (nr.resource_type === 'firewall' && nr.specs?.entities?.length > 0) {
      for (const e of nr.specs.entities) {
        const linode = resourcesByTypeAndId[`linode:${e.id}`];
        if (linode) fwLinodePairs.add(`${nr.id}:${linode.id}`);
      }
    }
  }

  for (const pair of fwLinodePairs) {
    const [fwDbId, linodeDbId] = pair.split(':');
    relationships.push({
      account_id: accountId,
      source_id: fwDbId,
      target_id: linodeDbId,
      relationship_type: 'protects',
      synced_at: syncedAt,
    });
  }

  for (const nr of newResources || []) {
    if (nr.resource_type === 'volume' && nr.specs?.linode_id) {
      const linode = resourcesByTypeAndId[`linode:${nr.specs.linode_id}`];
      if (linode) {
        relationships.push({
          account_id: accountId,
          source_id: nr.id,
          target_id: linode.id,
          relationship_type: 'attached_to',
          synced_at: syncedAt,
        });
      }
    }

    if (nr.resource_type === 'vpc' && nr.specs?.subnets?.length > 0) {
      for (const subnet of nr.specs.subnets) {
        for (const linodeId of (subnet.linode_ids || [])) {
          const linode = resourcesByTypeAndId[`linode:${linodeId}`];
          if (linode) {
            relationships.push({
              account_id: accountId,
              source_id: nr.id,
              target_id: linode.id,
              relationship_type: 'contains',
              metadata: {
                subnet_label: subnet.label,
                subnet_ipv4: subnet.ipv4,
                subnet_id: subnet.id,
                region: nr.region,
              },
              synced_at: syncedAt,
            });
          }
        }
      }
    }

    if (nr.resource_type === 'database' && nr.specs?.vpc_id) {
      const vpc = resourcesByTypeAndId[`vpc:${nr.specs.vpc_id}`];
      if (vpc) {
        const matchingSubnet = vpc.specs?.subnets?.find((s: any) => s.id === nr.specs.subnet_id);
        relationships.push({
          account_id: accountId,
          source_id: vpc.id,
          target_id: nr.id,
          relationship_type: 'contains',
          metadata: {
            subnet_label: matchingSubnet?.label || 'default',
            subnet_ipv4: matchingSubnet?.ipv4 || '',
            subnet_id: nr.specs.subnet_id ?? -1,
            region: vpc.region,
            member_type: 'database',
          },
          synced_at: syncedAt,
        });
      }
    }
  }

  if (relationships.length > 0) {
    await supabase.from('resource_relationships').insert(relationships);
  }

  onProgress?.('Fetching events...');
  const eventsRes = await fetch('https://api.linode.com/v4/account/events?page_size=500', { headers });
  if (eventsRes.ok) {
    const eventsData = await eventsRes.json();
    const eventsToUpsert = (eventsData.data || []).map((ev: any) => ({
      account_id: accountId,
      event_id: ev.id,
      action: ev.action,
      entity_id: ev.entity?.id != null ? String(ev.entity.id) : null,
      entity_type: ev.entity?.type || null,
      entity_label: ev.entity?.label || null,
      entity_url: ev.entity?.url || null,
      secondary_entity_id: ev.secondary_entity?.id != null ? String(ev.secondary_entity.id) : null,
      secondary_entity_type: ev.secondary_entity?.type || null,
      secondary_entity_label: ev.secondary_entity?.label || null,
      message: ev.message || null,
      status: ev.status || null,
      username: ev.username || null,
      duration: ev.duration || null,
      percent_complete: ev.percent_complete || null,
      seen: ev.seen || false,
      event_created: ev.created || null,
    }));

    if (eventsToUpsert.length > 0) {
      await supabase
        .from('linode_events')
        .upsert(eventsToUpsert, { onConflict: 'account_id,event_id', ignoreDuplicates: true });
    }
  }

  await supabase
    .from('linode_accounts')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', accountId);

  const totalCost = resources.reduce((sum: number, r: any) => sum + (r.monthly_cost || 0), 0);
  await supabase
    .from('cost_summary')
    .upsert({
      account_id: accountId,
      cost_date: new Date().toISOString().split('T')[0],
      total_cost: totalCost,
      resource_breakdown: resources.reduce((acc: any, r: any) => {
        if (!acc[r.resource_type]) acc[r.resource_type] = { count: 0, cost: 0 };
        acc[r.resource_type].count++;
        acc[r.resource_type].cost += r.monthly_cost || 0;
        return acc;
      }, {}),
    }, { onConflict: 'account_id,cost_date' });

  return { success: true, count: resources.length };
}
