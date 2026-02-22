import { getAuthedClient, getCurrentUserId } from './supabase';
import type { LinodeAccount, Resource, Recommendation, Budget, AIConfig, SavingsProfile } from '../types';
import { SAVINGS_PROFILE_THRESHOLDS, SAVINGS_PROFILE_LABELS } from '../types';
import { buildDefaultPromptTemplate, renderPrompt } from './prompts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: ReturnType<typeof getAuthedClient> = new Proxy({} as any, {
  get(_: unknown, prop: string) {
    return (getAuthedClient() as any)[prop];
  },
});


const STATS_RATE_LIMIT = 50;
const STATS_WINDOW_MS = 60_000;

const statsRateLimiter = {
  tokens: STATS_RATE_LIMIT,
  windowStart: Date.now(),
  queue: [] as Array<() => void>,
  running: false,

  async acquire() {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this._drain();
    });
  },

  _drain() {
    if (this.running) return;
    this.running = true;
    this._tick();
  },

  _tick() {
    const now = Date.now();
    if (now - this.windowStart >= STATS_WINDOW_MS) {
      this.tokens = STATS_RATE_LIMIT;
      this.windowStart = now;
    }

    if (this.queue.length === 0) {
      this.running = false;
      return;
    }

    if (this.tokens > 0) {
      this.tokens--;
      const resolve = this.queue.shift()!;
      resolve();
      setTimeout(() => this._tick(), 0);
    } else {
      const waitMs = STATS_WINDOW_MS - (now - this.windowStart) + 10;
      setTimeout(() => {
        this.tokens = STATS_RATE_LIMIT;
        this.windowStart = Date.now();
        this._tick();
      }, waitMs);
    }
  },
};

export async function fetchLinodeResources(accountId: string, onProgress?: (msg: string) => void) {
  // Get account details
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

  try {
    // Fetch all resource types from Linode API
    const resources: any[] = [];

    // Fetch Linodes
    onProgress?.('Fetching instances...');
    const linodesRes = await fetch('https://api.linode.com/v4/linode/instances', { headers });
    if (linodesRes.ok) {
      const linodesData = await linodesRes.json();
      for (const instance of linodesData.data || []) {
        // Get pricing for the type
        const typeRes = await fetch(`https://api.linode.com/v4/linode/types/${instance.type}`, { headers });
        let price = 0;
        if (typeRes.ok) {
          const typeData = await typeRes.json();
          console.log('Type data for', instance.type, ':', typeData);
          price = typeData.price?.monthly || typeData.monthly_price || 0;
        } else {
          console.error('Failed to fetch type:', instance.type, typeRes.status);
        }

        // Fetch firewalls attached to this Linode instance directly
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
          // 400/404 means this instance doesn't support firewall queries — not an error
        } catch {
          // ignore firewall fetch failure
        }

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

    // Fetch Volumes
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

    // Fetch NodeBalancers
    onProgress?.('Fetching NodeBalancers...');
    const nbRes = await fetch('https://api.linode.com/v4/nodebalancers', { headers });
    if (nbRes.ok) {
      const nbData = await nbRes.json();
      for (const nb of nbData.data || []) {
        let nodeCount = 0;
        let nbNodes: Array<{ id: number; label: string; address: string; status: string; linode_id: number | null }> = [];
        let nbConfigs: Array<{ id: number; port: number; protocol: string; algorithm: string; stickiness: string; check: string; check_interval: number; check_timeout: number; check_attempts: number; check_passive: boolean; cipher_suite: string; proxy_protocol: string; nodes_status: { up: number; down: number } }> = [];
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
        } catch {
          nodeCount = 0;
        }

        let nbVpcs: Array<{ vpc_id: number; subnet_id: number; ipv4_range: string | null }> = [];
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
        } catch {
          // ignore VPC fetch failure
        }

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

    // Fetch LKE Types for pricing
    onProgress?.('Fetching LKE clusters...');
    let lkeTypes: Record<string, { hourly: number; monthly: number }> = {};
    try {
      const lkeTypesRes = await fetch('https://api.linode.com/v4/lke/types', { headers });
      if (lkeTypesRes.ok) {
        const lkeTypesData = await lkeTypesRes.json();
        for (const t of lkeTypesData.data || []) {
          lkeTypes[t.id] = {
            hourly: t.price?.hourly || 0,
            monthly: t.price?.monthly || 0,
          };
        }
      }
    } catch {
      // ignore pricing fetch failure
    }

    // Fetch LKE Clusters
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
              if (pricing) {
                monthlyCost += pricing.monthly * (pool.count || 0);
              }
            }
          }
        } catch {
          // ignore pool fetch failure
        }

        // Add control plane HA cost if applicable
        if (cluster.control_plane?.high_availability) {
          const haPricing = lkeTypes['lke-ha'];
          if (haPricing) {
            monthlyCost += haPricing.monthly;
          }
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
            pools: nodePools.map((p: any) => ({
              id: p.id,
              type: p.type,
              count: p.count,
            })),
          },
        });
      }
    }

    // Fetch Object Storage Buckets with pagination
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
          } catch {}

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

    // Calculate total object storage cost for the account
    // $5/month for first 250GB, then $0.02/GB for additional storage
    const objectStorageCost = totalObjectStorageSize <= 250
      ? (objectStorageBuckets.length > 0 ? 5 : 0)
      : 5 + (totalObjectStorageSize - 250) * 0.02;

    // Distribute cost proportionally across buckets based on their size
    if (objectStorageBuckets.length > 0 && totalObjectStorageSize > 0) {
      objectStorageBuckets.forEach(bucket => {
        bucket.monthly_cost = (bucket.specs.size / totalObjectStorageSize) * objectStorageCost;
      });
    }

    resources.push(...objectStorageBuckets);

    // Fetch Managed Database types for pricing (no auth required)
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
    } catch {
      // ignore pricing fetch failure
    }

    // Fetch Managed Database instances
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
            if (Array.isArray(dbDetail.allow_list)) {
              allowList = dbDetail.allow_list;
            }
          }
        } catch {
          // ignore per-instance fetch failure
        }

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

    // Fetch Firewalls
    onProgress?.('Fetching firewalls...');
    const firewallsRes = await fetch('https://api.linode.com/v4/networking/firewalls', { headers });
    if (firewallsRes.ok) {
      const firewallsData = await firewallsRes.json();
      for (const fw of firewallsData.data || []) {
        const inboundRules = fw.rules?.inbound || [];
        const outboundRules = fw.rules?.outbound || [];
        const entities = fw.entities || [];

        const linodeIdsSeen = new Set<number>();
        const linodeEntities: Array<{ id: number; label: string; via_interface: boolean }> = [];

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

    // Fetch VPCs
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

    // Fetch existing resources before deleting (for snapshot diffing)
    onProgress?.('Saving resources...');
    const { data: existingResources } = await supabase
      .from('resources')
      .select('*')
      .eq('account_id', accountId);

    const existingByResourceId: Record<string, any> = {};
    for (const r of existingResources || []) {
      existingByResourceId[`${r.resource_type}:${r.resource_id}`] = r;
    }

    // Delete existing resources for this account
    await supabase.from('resources').delete().eq('account_id', accountId);

    // Insert new resources
    if (resources.length > 0) {
      const { error: insertError } = await supabase
        .from('resources')
        .insert(resources);

      if (insertError) throw insertError;
    }

    // Fetch newly inserted resources to get their UUIDs
    const { data: newResources } = await supabase
      .from('resources')
      .select('*')
      .eq('account_id', accountId);

    const syncedAt = new Date().toISOString();

    // Build snapshots with diffs
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
        const prevSpecs = JSON.stringify(prev.specs || {});
        const newSpecs = JSON.stringify(nr.specs || {});
        if (prevSpecs !== newSpecs) {
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

    // Build resource relationships
    onProgress?.('Mapping relationships...');
    await supabase.from('resource_relationships').delete().eq('account_id', accountId);

    const relationships: any[] = [];
    const resourcesByTypeAndId: Record<string, any> = {};
    for (const nr of newResources || []) {
      resourcesByTypeAndId[`${nr.resource_type}:${nr.resource_id}`] = nr;
    }

    // Firewall → Linode relationships
    // Build a de-duplicated set of (firewall_db_id, linode_db_id) pairs from both sources:
    // 1. Per-Linode attached_firewalls (direct attachment)
    // 2. Firewall entities list (covers interface-attached firewalls)
    const fwLinodePairs = new Set<string>();

    for (const nr of newResources || []) {
      if (nr.resource_type === 'linode' && nr.specs?.attached_firewalls?.length > 0) {
        for (const fw of nr.specs.attached_firewalls) {
          const firewall = resourcesByTypeAndId[`firewall:${fw.id}`];
          if (firewall) {
            fwLinodePairs.add(`${firewall.id}:${nr.id}`);
          }
        }
      }
      if (nr.resource_type === 'firewall' && nr.specs?.entities?.length > 0) {
        for (const e of nr.specs.entities) {
          const linode = resourcesByTypeAndId[`linode:${e.id}`];
          if (linode) {
            fwLinodePairs.add(`${nr.id}:${linode.id}`);
          }
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
      // Volume → Linode relationships
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

      // VPC → Linode relationships (via subnets)
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

      // VPC → Database relationships (via specs.vpc_id / specs.subnet_id)
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

    // Fetch and store Linode account events
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

    // Update last sync time
    await supabase
      .from('linode_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', accountId);

    // Update cost summary
    const totalCost = resources.reduce((sum, r) => sum + (r.monthly_cost || 0), 0);
    await supabase
      .from('cost_summary')
      .upsert({
        account_id: accountId,
        cost_date: new Date().toISOString().split('T')[0],
        total_cost: totalCost,
        resource_breakdown: resources.reduce((acc: any, r) => {
          if (!acc[r.resource_type]) {
            acc[r.resource_type] = { count: 0, cost: 0 };
          }
          acc[r.resource_type].count++;
          acc[r.resource_type].cost += r.monthly_cost || 0;
          return acc;
        }, {}),
      }, { onConflict: 'account_id,cost_date' });

    return { success: true, count: resources.length };
  } catch (error: any) {
    console.error('Error fetching Linode resources:', error);
    throw new Error(error.message || 'Failed to sync resources');
  }
}

async function fetchNodeBalancerMetrics(resourceId: string, resource: any, timeRange: string) {
  const { data: account, error: accountError } = await supabase
    .from('linode_accounts')
    .select('api_token')
    .eq('id', resource.account_id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error('Account not found');
  }

  const linodeHeaders = {
    'Authorization': `Bearer ${account.api_token}`,
    'Content-Type': 'application/json',
  };

  const nbId = resource.resource_id;
  await statsRateLimiter.acquire();
  const response = await fetch(`https://api.linode.com/v4/nodebalancers/${nbId}/stats`, {
    headers: linodeHeaders,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch NodeBalancer stats: ${response.statusText}`);
  }

  const stats = await response.json();

  const timeRanges: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const rangeMs = timeRanges[timeRange] || timeRanges['24h'];
  const endTime = Date.now();
  const startTime = endTime - rangeMs;

  const metrics: any[] = [];

  const processPoints = (points: any[], metricName: string, unit: string) => {
    if (!Array.isArray(points)) return;
    points.forEach((point: any) => {
      if (Array.isArray(point) && point.length >= 2) {
        const timestamp = point[0];
        if (timestamp >= startTime && timestamp <= endTime) {
          metrics.push({
            resource_id: resourceId,
            metric_type: metricName,
            timestamp: new Date(timestamp).toISOString(),
            value: parseFloat(point[1]) || 0,
            unit,
          });
        }
      }
    });
  };

  processPoints(stats.data?.connections ?? [], 'connections', 'connections/s');
  processPoints(stats.data?.traffic?.in ?? [], 'traffic_in', 'bits/s');
  processPoints(stats.data?.traffic?.out ?? [], 'traffic_out', 'bits/s');

  if (metrics.length > 0) {
    await supabase.from('metrics_history').insert(metrics);
  }

  const calcStats = (type: string) => {
    const pts = metrics.filter((m) => m.metric_type === type).map((m) => m.value);
    if (pts.length === 0) return { avg: 0, max: 0, min: 0, count: 0 };
    const avg = pts.reduce((s, v) => s + v, 0) / pts.length;
    return { avg, max: Math.max(...pts), min: Math.min(...pts), count: pts.length };
  };

  return {
    success: true,
    resource_type: 'nodebalancer',
    metrics_count: metrics.length,
    time_range: timeRange,
    aggregated: {
      connections: calcStats('connections'),
      traffic_in: calcStats('traffic_in'),
      traffic_out: calcStats('traffic_out'),
    },
    metrics,
  };
}

export async function fetchLinodeMetrics(resourceId: string, timeRange: string = '24h') {
  // Get resource details from database
  const { data: resource, error: resourceError } = await supabase
    .from('resources')
    .select('account_id, resource_id, resource_type')
    .eq('id', resourceId)
    .maybeSingle();

  if (resourceError || !resource) {
    throw new Error('Resource not found');
  }

  if (resource.resource_type === 'nodebalancer') {
    return fetchNodeBalancerMetrics(resourceId, resource, timeRange);
  }

  if (resource.resource_type !== 'linode') {
    return {
      success: true,
      message: 'Metrics only available for Linode instances',
      metrics: [],
      metrics_count: 0,
      aggregated: null,
    };
  }

  // Get account API token
  const { data: account, error: accountError } = await supabase
    .from('linode_accounts')
    .select('api_token')
    .eq('id', resource.account_id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error('Account not found');
  }

  // Calculate time range
  const timeRanges: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  const rangeMs = timeRanges[timeRange] || timeRanges['24h'];
  const endTime = Date.now();
  const startTime = endTime - rangeMs;

  // Fetch metrics from Linode API
  const linodeHeaders = {
    'Authorization': `Bearer ${account.api_token}`,
    'Content-Type': 'application/json',
  };

  const linodeId = resource.resource_id;

  let url: string;
  if (timeRange === '30d' || timeRange === '7d') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    url = `https://api.linode.com/v4/linode/instances/${linodeId}/stats/${year}/${month}`;
  } else {
    url = `https://api.linode.com/v4/linode/instances/${linodeId}/stats`;
  }

  await statsRateLimiter.acquire();
  const response = await fetch(url, { headers: linodeHeaders });

  if (!response.ok) {
    throw new Error(`Failed to fetch metrics from Linode: ${response.statusText}`);
  }

  const stats = await response.json();
  const metrics: any[] = [];

  const processMetricData = (data: any, metricName: string, unit: string) => {
    if (!data) return;

    let dataPoints: any[] = [];

    if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0]) && Array.isArray(data[0][0])) {
        dataPoints = data.flat();
      } else {
        dataPoints = data;
      }
    }

    dataPoints.forEach((point: any) => {
      if (Array.isArray(point) && point.length >= 2) {
        const timestamp = new Date(point[0]).getTime();
        if (timestamp >= startTime && timestamp <= endTime) {
          metrics.push({
            resource_id: resourceId,
            metric_type: metricName,
            timestamp: new Date(point[0]).toISOString(),
            value: parseFloat(point[1]) || 0,
            unit,
          });
        }
      }
    });
  };

  const cpuData = stats.data?.cpu || stats.cpu;
  const ioData = stats.data?.io?.io || stats.io?.io;
  const swapData = stats.data?.io?.swap || stats.io?.swap;
  const netInData = stats.data?.netv4?.in || stats.netv4?.in;
  const netOutData = stats.data?.netv4?.out || stats.netv4?.out;

  if (cpuData) {
    processMetricData(cpuData, 'cpu_usage', 'percent');
  }

  if (ioData) {
    processMetricData(ioData, 'disk_io', 'blocks');
  }

  if (swapData) {
    processMetricData(swapData, 'swap_io', 'blocks');
  }

  if (netInData) {
    processMetricData(netInData, 'network_in', 'bits/sec');
  }

  if (netOutData) {
    processMetricData(netOutData, 'network_out', 'bits/sec');
  }

  // Store metrics in database for historical tracking (batch insert)
  if (metrics.length > 0) {
    await supabase.from('metrics_history').insert(metrics);
  }

  // Calculate aggregated metrics
  const aggregatedMetrics: any = {
    cpu: { avg: 0, max: 0, min: 100, count: 0 },
    disk_io: { avg: 0, max: 0, min: Infinity, count: 0 },
    swap_io: { avg: 0, max: 0, min: Infinity, count: 0 },
    network_in: { avg: 0, max: 0, min: Infinity, count: 0 },
    network_out: { avg: 0, max: 0, min: Infinity, count: 0 },
  };

  metrics.forEach((m) => {
    const category =
      m.metric_type === 'cpu_usage'
        ? 'cpu'
        : m.metric_type === 'disk_io'
        ? 'disk_io'
        : m.metric_type === 'swap_io'
        ? 'swap_io'
        : m.metric_type === 'network_in'
        ? 'network_in'
        : 'network_out';

    if (aggregatedMetrics[category]) {
      aggregatedMetrics[category].count++;
      aggregatedMetrics[category].avg += m.value;
      aggregatedMetrics[category].max = Math.max(
        aggregatedMetrics[category].max,
        m.value
      );
      aggregatedMetrics[category].min = Math.min(
        aggregatedMetrics[category].min,
        m.value
      );
    }
  });

  Object.keys(aggregatedMetrics).forEach((key) => {
    if (aggregatedMetrics[key].count > 0) {
      aggregatedMetrics[key].avg /= aggregatedMetrics[key].count;
    }
  });

  return {
    success: true,
    metrics_count: metrics.length,
    time_range: timeRange,
    aggregated: aggregatedMetrics,
    metrics: metrics,
  };
}

async function getLinodeTypes(apiToken: string, forceRefresh = false): Promise<any[]> {
  if (!forceRefresh) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: cached, error: cacheError } = await supabase
      .from('linode_types_cache')
      .select('*')
      .gte('fetched_at', oneDayAgo)
      .order('price_monthly', { ascending: true });

    if (!cacheError && cached && cached.length > 0) {
      return cached;
    }
  }

  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  const allTypes: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`https://api.linode.com/v4/linode/types?page=${page}&page_size=100`, { headers });
    if (!res.ok) break;
    const data = await res.json();
    allTypes.push(...(data.data || []));
    hasMore = data.page < data.pages;
    page++;
  }

  if (allTypes.length === 0) {
    const { data: fallback } = await supabase
      .from('linode_types_cache')
      .select('*')
      .order('price_monthly', { ascending: true });
    return fallback || [];
  }

  const rows = allTypes.map((t: any) => ({
    id: t.id,
    label: t.label,
    class: t.class || '',
    vcpus: t.vcpus || 0,
    memory: t.memory || 0,
    disk: t.disk || 0,
    network_out: t.network_out || 0,
    transfer: t.transfer || 0,
    price_monthly: t.price?.monthly || 0,
    price_hourly: t.price?.hourly || 0,
    gpus: t.gpus || 0,
    successor: t.successor || null,
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from('linode_types_cache').delete().neq('id', '');
  await supabase.from('linode_types_cache').insert(rows);

  return rows;
}

export async function refreshLinodeTypes(accountId: string): Promise<number> {
  const { data: account, error } = await supabase
    .from('linode_accounts')
    .select('api_token')
    .eq('id', accountId)
    .maybeSingle();

  if (error || !account) throw new Error('Account not found');

  const types = await getLinodeTypes(account.api_token, true);
  return types.length;
}

export async function generateRecommendations(resourceId: string) {
  // Get resource details and account token in one query
  const { data: resource, error: resourceError } = await supabase
    .from('resources')
    .select('*, linode_accounts(api_token)')
    .eq('id', resourceId)
    .maybeSingle();

  if (resourceError || !resource) {
    throw new Error('Resource not found');
  }

  // Get AI configuration
  const { data: aiConfig, error: aiConfigError } = await supabase
    .from('ai_config')
    .select('*')
    .maybeSingle();

  if (aiConfigError || !aiConfig) {
    throw new Error('AI configuration not found. Please configure AI endpoint first.');
  }

  const apiToken = (resource.linode_accounts as any)?.api_token;

  // Fetch fresh 7-day metrics and Linode types (cached) in parallel
  const [linodeTypes] = await Promise.all([
    apiToken ? getLinodeTypes(apiToken) : Promise.resolve([]),
    fetchLinodeMetrics(resourceId, '7d'),
  ]);

  // Get metrics from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: metrics, error: metricsError } = await supabase
    .from('metrics_history')
    .select('*')
    .eq('resource_id', resourceId)
    .gte('timestamp', sevenDaysAgo)
    .order('timestamp', { ascending: true });

  if (metricsError) {
    console.error('Error fetching metrics:', metricsError);
  }

  const metricsData = metrics || [];

  // Process metrics by type
  const cpuMetrics = metricsData.filter((m) => m.metric_type === 'cpu_usage');
  const diskMetrics = metricsData.filter((m) => m.metric_type === 'disk_io');
  const swapMetrics = metricsData.filter((m) => m.metric_type === 'swap_io');
  const networkInMetrics = metricsData.filter((m) => m.metric_type === 'network_in');
  const networkOutMetrics = metricsData.filter((m) => m.metric_type === 'network_out');

  // Calculate statistics
  const calculateStats = (data: any[]) => {
    if (data.length === 0) return { avg: 0, max: 0, min: 0, p95: 0 };

    const values = data.map((m) => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const max = values[values.length - 1];
    const min = values[0];
    const p95Index = Math.floor(values.length * 0.95);
    const p95 = values[p95Index] || max;

    return { avg, max, min, p95 };
  };

  const cpuStats = calculateStats(cpuMetrics);
  const diskStats = calculateStats(diskMetrics);
  const swapStats = calculateStats(swapMetrics);
  const networkInStats = calculateStats(networkInMetrics);
  const networkOutStats = calculateStats(networkOutMetrics);

  // Normalize CPU: Linode reports cumulative % across all cores.
  // A 4-vCPU machine at 100% on all cores = 400%. Normalize to per-core %.
  const vcpus = resource.specs?.vcpus || 1;
  const gpus = resource.specs?.gpus || 0;
  const normalizeCpu = (val: number) => val / vcpus;

  const normalizedCpuStats = {
    avg: normalizeCpu(cpuStats.avg),
    max: normalizeCpu(cpuStats.max),
    min: normalizeCpu(cpuStats.min),
    p95: normalizeCpu(cpuStats.p95),
  };

  const profile: SavingsProfile = ((aiConfig as any).savings_profile as SavingsProfile) || 'balanced';
  const thresholds = SAVINGS_PROFILE_THRESHOLDS[profile];
  const profileLabel = SAVINGS_PROFILE_LABELS[profile].label;

  const metricsSummary = {
    resource_type: resource.resource_type,
    label: resource.label,
    plan_type: resource.plan_type,
    region: resource.region,
    monthly_cost: resource.monthly_cost || 0,
    specs: resource.specs,
    metrics_period: '7 days',
    cpu: normalizedCpuStats,
    cpu_raw: cpuStats,
    disk_io: diskStats,
    swap_io: swapStats,
    network_in: networkInStats,
    network_out: networkOutStats,
    data_points: metricsData.length,
  };

  const typesContext = linodeTypes.length > 0
    ? `\nAvailable Linode Instance Types (use exact IDs when suggesting changes):\n${
        linodeTypes
          .filter((t) => !t.successor)
          .map((t) => `- ${t.id}: ${t.label} | ${t.vcpus} vCPU, ${t.memory / 1024}GB RAM, ${t.disk / 1024}GB disk | $${t.price_monthly}/mo (${t.class})`)
          .join('\n')
      }`
    : '';

  const { data: profilePromptRow } = await supabase
    .from('profile_prompts')
    .select('prompt')
    .eq('profile', profile)
    .maybeSingle();

  const promptTemplate = profilePromptRow?.prompt || buildDefaultPromptTemplate(profile);

  const prompt = renderPrompt(promptTemplate, {
    profileLabel,
    profile,
    metricsSummary,
    vcpus,
    gpus,
    normalizedCpuStats,
    cpuStats,
    diskStats,
    swapStats,
    networkInStats,
    networkOutStats,
    metricsDataLength: metricsData.length,
    typesContext,
  });

  // Call AI API
  const aiResponse = await fetch(aiConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiConfig.api_key}`,
    },
    body: JSON.stringify({
      model: aiConfig.model_name,
      messages: [
        {
          role: 'system',
          content: 'You are a cloud cost optimization expert. Provide recommendations in valid JSON format only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`AI API error: ${aiResponse.statusText}`);
  }

  const aiResult = await aiResponse.json();
  const recommendation = JSON.parse(aiResult.choices[0].message.content);

  // Save recommendation to database
  const { error: insertError } = await supabase.from('recommendations').insert({
    resource_id: resourceId,
    recommendation_type: recommendation.recommendation_type,
    current_plan: recommendation.current_plan,
    suggested_plan: recommendation.suggested_plan,
    title: recommendation.title,
    reasoning: recommendation.reasoning,
    note: recommendation.note || null,
    description: recommendation.reasoning,
    estimated_savings: recommendation.estimated_savings || 0,
    estimated_cost_increase: recommendation.estimated_cost_increase || 0,
    potential_savings: recommendation.estimated_savings - recommendation.estimated_cost_increase,
    confidence_score: recommendation.confidence_score || 0,
    metrics_summary: metricsSummary,
    status: 'active',
  });

  if (insertError) {
    throw insertError;
  }

  return {
    success: true,
    recommendation,
  };
}

export async function getAccounts(): Promise<LinodeAccount[]> {
  const { data, error } = await supabase
    .from('linode_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createAccount(name: string, apiToken: string): Promise<LinodeAccount> {
  const { data, error } = await supabase
    .from('linode_accounts')
    .insert({ name, api_token: apiToken })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAccount(id: string) {
  const { error } = await supabase
    .from('linode_accounts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function renameAccount(id: string, name: string) {
  const { error } = await supabase
    .from('linode_accounts')
    .update({ name })
    .eq('id', id);

  if (error) throw error;
}

export async function getResources(accountId?: string): Promise<Resource[]> {
  let query = supabase
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false });

  if (accountId) {
    query = query.eq('account_id', accountId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getLinodeTypesCache(): Promise<Record<string, any>> {
  const { data, error } = await supabase
    .from('linode_types_cache')
    .select('id, label, vcpus, memory, disk, price_monthly');

  if (error || !data) return {};

  return data.reduce((acc, t) => {
    acc[t.id] = t;
    return acc;
  }, {} as Record<string, any>);
}

export async function getRecommendations(status: string = 'active', accountId?: string): Promise<Recommendation[]> {
  let query = supabase
    .from('recommendations')
    .select('*, resources(*)')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (accountId) {
    query = query.eq('resources.account_id', accountId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function dismissRecommendation(id: string) {
  const { error } = await supabase
    .from('recommendations')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getBudgets(accountId: string): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budget_alerts')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createBudget(budget: Partial<Budget>): Promise<Budget> {
  const payload = {
    ...budget,
    budget_amount: budget.monthly_limit ?? budget.budget_amount,
  };
  const { data, error } = await supabase
    .from('budget_alerts')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBudget(id: string, updates: Partial<Budget>) {
  const payload: any = { ...updates };
  if (updates.monthly_limit !== undefined) {
    payload.budget_amount = updates.monthly_limit;
  }
  const { error } = await supabase
    .from('budget_alerts')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteBudget(id: string) {
  const { error } = await supabase
    .from('budget_alerts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const { data, error } = await supabase
    .from('ai_config')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveAIConfig(config: Partial<AIConfig>): Promise<AIConfig> {
  const existing = await getAIConfig();

  if (existing) {
    const { data, error } = await supabase
      .from('ai_config')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('ai_config')
      .insert(config)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export async function getCostHistory(accountId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('cost_summary')
    .select('*')
    .eq('account_id', accountId)
    .gte('cost_date', startDate.toISOString().split('T')[0])
    .order('cost_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getProfilePrompt(profile: SavingsProfile): Promise<string | null> {
  const { data } = await supabase
    .from('profile_prompts')
    .select('prompt')
    .eq('profile', profile)
    .maybeSingle();
  return data?.prompt ?? null;
}

export async function saveProfilePrompt(profile: SavingsProfile, prompt: string | null): Promise<void> {
  const { data: existing } = await supabase
    .from('profile_prompts')
    .select('id')
    .eq('profile', profile)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('profile_prompts')
      .update({ prompt, updated_at: new Date().toISOString() })
      .eq('profile', profile);
  } else {
    await supabase
      .from('profile_prompts')
      .insert({ profile, prompt });
  }
}

export async function getPotentialSavings(accountId?: string): Promise<number> {
  let query = supabase
    .from('recommendations')
    .select('potential_savings')
    .eq('status', 'active');

  if (accountId) {
    // Join with resources to filter by account
    const { data, error } = await supabase
      .from('recommendations')
      .select('potential_savings, resources!inner(account_id)')
      .eq('status', 'active')
      .eq('resources.account_id', accountId);

    if (error) throw error;

    const totalSavings = (data || []).reduce((sum, rec) => sum + (rec.potential_savings || 0), 0);
    return totalSavings;
  }

  const { data, error } = await query;

  if (error) throw error;

  const totalSavings = (data || []).reduce((sum, rec) => sum + (rec.potential_savings || 0), 0);
  return totalSavings;
}

// ============================================================
// Config: Snapshots
// ============================================================

export async function getResourceSnapshots(resourceId: string, limit = 20) {
  const { data, error } = await supabase
    .from('resource_snapshots')
    .select('*')
    .eq('resource_id', resourceId)
    .order('synced_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getAccountSnapshots(accountId: string, limit = 100) {
  const { data, error } = await supabase
    .from('resource_snapshots')
    .select('*')
    .eq('account_id', accountId)
    .not('diff', 'is', null)
    .order('synced_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getAccountAllSnapshots(accountId: string, limit = 500) {
  const { data, error } = await supabase
    .from('resource_snapshots')
    .select('*')
    .eq('account_id', accountId)
    .order('synced_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ============================================================
// Config: Compliance Rules
// ============================================================

export async function getAccountTimestamps(accountId: string): Promise<{ last_sync_at: string | null; last_evaluated_at: string | null }> {
  const { data } = await supabase
    .from('linode_accounts')
    .select('last_sync_at, last_evaluated_at')
    .eq('id', accountId)
    .maybeSingle();
  return { last_sync_at: data?.last_sync_at ?? null, last_evaluated_at: data?.last_evaluated_at ?? null };
}

export async function getComplianceRules(accountId?: string) {
  let query = supabase
    .from('compliance_rules')
    .select('*')
    .order('severity', { ascending: true })
    .order('name', { ascending: true });

  if (accountId) {
    query = query.or(`account_id.is.null,account_id.eq.${accountId}`);
  } else {
    query = query.is('account_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (!accountId || !data) return data || [];

  const { data: overrides } = await supabase
    .from('account_rule_overrides')
    .select('rule_id, is_active')
    .eq('account_id', accountId);

  const overrideMap = new Map(
    (overrides ?? []).map((o: { rule_id: string; is_active: boolean }) => [o.rule_id, o.is_active])
  );

  const withOverrides = data.map((rule: { id: string; [key: string]: unknown }) =>
    overrideMap.has(rule.id) ? { ...rule, is_active: overrideMap.get(rule.id) } : rule
  );

  const nameMap = new Map<string, typeof withOverrides[0]>();
  for (const rule of withOverrides) {
    const name = rule.name as string;
    const existing = nameMap.get(name);
    if (!existing || (rule.account_id !== null && existing.account_id === null)) {
      nameMap.set(name, rule);
    }
  }
  return Array.from(nameMap.values());
}

export async function getAccountRuleOverrides(accountId: string) {
  const { data, error } = await supabase
    .from('account_rule_overrides')
    .select('*')
    .eq('account_id', accountId);
  if (error) throw error;
  return data || [];
}

export async function applyProfileRules(accountId: string, profile: { id: string; rule_condition_types: string[] }): Promise<{ enabled: number; disabled: number }> {
  const { data: allRules, error } = await supabase
    .from('compliance_rules')
    .select('id, condition_type, account_id')
    .or(`account_id.is.null,account_id.eq.${accountId}`);
  if (error) throw error;

  const inScope = new Set(profile.rule_condition_types);
  const upserts: { account_id: string; rule_id: string; is_active: boolean; applied_by_profile_id: string; updated_at: string }[] = [];

  for (const rule of (allRules || [])) {
    upserts.push({
      account_id: accountId,
      rule_id: rule.id,
      is_active: inScope.has(rule.condition_type),
      applied_by_profile_id: profile.id,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length === 0) return { enabled: 0, disabled: 0 };

  const { error: upsertError } = await supabase
    .from('account_rule_overrides')
    .upsert(upserts, { onConflict: 'account_id,rule_id' });
  if (upsertError) throw upsertError;

  return {
    enabled: upserts.filter(u => u.is_active).length,
    disabled: upserts.filter(u => !u.is_active).length,
  };
}

export async function toggleRuleForAccount(accountId: string, ruleId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('account_rule_overrides')
    .upsert(
      { account_id: accountId, rule_id: ruleId, is_active: isActive, updated_at: new Date().toISOString() },
      { onConflict: 'account_id,rule_id' }
    );
  if (error) throw error;
}

export async function createComplianceRule(rule: {
  name: string;
  description: string;
  resource_types: string[];
  condition_type: string;
  condition_config: Record<string, any>;
  severity: string;
  account_id?: string;
}) {
  const { data, error } = await supabase
    .from('compliance_rules')
    .insert({ ...rule, is_builtin: false })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateComplianceRule(id: string, updates: Partial<{
  name: string;
  description: string;
  resource_types: string[];
  condition_type: string;
  condition_config: Record<string, any>;
  severity: string;
  is_active: boolean;
}>) {
  const { error } = await supabase
    .from('compliance_rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteComplianceRule(id: string) {
  const { error } = await supabase
    .from('compliance_rules')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

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

  // Preserve existing acknowledgements keyed by rule_id + resource_id
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

  // Delete old results for this account
  await supabase.from('compliance_results').delete().eq('account_id', accountId);

  const results: any[] = [];
  const evaluatedAt = new Date().toISOString();

  const firewallResources = resources.filter(r => r.resource_type === 'firewall');

  const nonCompositeRules = rules.filter(r => r.condition_type !== 'composite');
  const compositeRules = rules.filter(r => r.condition_type === 'composite');

  for (const rule of nonCompositeRules) {
    if (rule.condition_type === 'login_allowed_ips') {
      if (!accountRow?.api_token) {
        results.push({
          rule_id: rule.id,
          resource_id: null,
          account_id: accountId,
          status: 'not_applicable',
          detail: 'No API token available to check login history.',
          evaluated_at: evaluatedAt,
        });
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
          results.push({
            rule_id: rule.id,
            resource_id: null,
            account_id: accountId,
            status: 'not_applicable',
            detail: 'No login history found to evaluate.',
            evaluated_at: evaluatedAt,
          });
        } else if (allowedIPs.length === 0) {
          results.push({
            rule_id: rule.id,
            resource_id: null,
            account_id: accountId,
            status: 'not_applicable',
            detail: 'No allowed IPs configured for this rule.',
            evaluated_at: evaluatedAt,
          });
        } else {
          for (const login of logins) {
            const ip: string = login.ip || 'unknown';
            const isAllowed = allowedIPs.includes(ip);
            const loginLabel = `${login.username} from ${ip} on ${new Date(login.datetime).toLocaleString()}`;
            results.push({
              rule_id: rule.id,
              resource_id: null,
              account_id: accountId,
              status: isAllowed ? 'compliant' : 'non_compliant',
              detail: isAllowed
                ? `Login allowed: ${loginLabel} — IP ${ip} is in the allowed list.`
                : `Login from unexpected IP: ${loginLabel} — IP ${ip} is not in the allowed list.`,
              evaluated_at: evaluatedAt,
            });
          }
        }
      } catch (e: any) {
        results.push({
          rule_id: rule.id,
          resource_id: null,
          account_id: accountId,
          status: 'not_applicable',
          detail: `Could not fetch login history: ${e?.message || 'unknown error'}`,
          evaluated_at: evaluatedAt,
        });
      }
      continue;
    }

    if (rule.condition_type === 'tfa_users') {
      if (!accountRow?.api_token) {
        results.push({
          rule_id: rule.id,
          resource_id: null,
          account_id: accountId,
          status: 'not_applicable',
          detail: 'No API token available to check user TFA status.',
          evaluated_at: evaluatedAt,
        });
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
        const filtered = users.filter(u => !excludeTypes.includes(u.user_type));
        if (filtered.length === 0) {
          results.push({
            rule_id: rule.id,
            resource_id: null,
            account_id: accountId,
            status: 'not_applicable',
            detail: 'No users found to evaluate.',
            evaluated_at: evaluatedAt,
          });
        } else {
          for (const user of filtered) {
            const hasTfa: boolean = user.tfa_enabled === true;
            results.push({
              rule_id: rule.id,
              resource_id: null,
              account_id: accountId,
              status: hasTfa ? 'compliant' : 'non_compliant',
              detail: hasTfa
                ? `User "${user.username}" has TFA enabled.`
                : `User "${user.username}" does not have TFA enabled.`,
              evaluated_at: evaluatedAt,
            });
          }
        }
      } catch (e: any) {
        results.push({
          rule_id: rule.id,
          resource_id: null,
          account_id: accountId,
          status: 'not_applicable',
          detail: `Could not fetch users: ${e?.message || 'unknown error'}`,
          evaluated_at: evaluatedAt,
        });
      }
      continue;
    }

    if (rule.condition_type === 'lke_control_plane_acl') {
      const lkeClusters = resources.filter(r => r.resource_type === 'lke_cluster');
      for (const resource of lkeClusters) {
        if (!accountRow?.api_token) {
          results.push({
            rule_id: rule.id,
            resource_id: resource.id,
            account_id: accountId,
            status: 'not_applicable',
            detail: 'No API token available to check control plane ACL.',
            evaluated_at: evaluatedAt,
          });
          continue;
        }
        try {
          const aclRes = await fetch(
            `https://api.linode.com/v4/lke/clusters/${resource.resource_id}/control_plane_acl`,
            { headers: { Authorization: `Bearer ${accountRow.api_token}`, accept: 'application/json' } }
          );
          if (aclRes.status === 400) {
            results.push({
              rule_id: rule.id,
              resource_id: resource.id,
              account_id: accountId,
              status: 'not_applicable',
              detail: 'This cluster does not support Control Plane ACL.',
              evaluated_at: evaluatedAt,
            });
            continue;
          }
          if (aclRes.status === 404) {
            results.push({
              rule_id: rule.id,
              resource_id: resource.id,
              account_id: accountId,
              status: 'not_applicable',
              detail: 'Cluster not found when checking Control Plane ACL.',
              evaluated_at: evaluatedAt,
            });
            continue;
          }
          if (!aclRes.ok) {
            throw new Error(`HTTP ${aclRes.status}`);
          }
          const aclData = await aclRes.json();
          const acl = aclData.acl || {};
          const enabled: boolean = acl.enabled ?? false;
          if (!enabled) {
            results.push({
              rule_id: rule.id,
              resource_id: resource.id,
              account_id: accountId,
              status: 'non_compliant',
              detail: 'Control plane ACL is not enabled. The Kubernetes API server is accessible from any IP.',
              evaluated_at: evaluatedAt,
            });
            continue;
          }
          const ipv4: string[] = acl.addresses?.ipv4 || [];
          const ipv6: string[] = acl.addresses?.ipv6 || [];
          const openV4 = ipv4.filter(ip => ip === '0.0.0.0/0');
          const openV6 = ipv6.filter(ip => ip === '::/0');
          if (openV4.length > 0 || openV6.length > 0) {
            const open = [...openV4, ...openV6].join(', ');
            results.push({
              rule_id: rule.id,
              resource_id: resource.id,
              account_id: accountId,
              status: 'non_compliant',
              detail: `Control plane ACL is enabled but allows unrestricted access: ${open}. Remove wildcard entries and restrict to known CIDRs.`,
              evaluated_at: evaluatedAt,
            });
          } else {
            const allCidrs = [...ipv4, ...ipv6];
            results.push({
              rule_id: rule.id,
              resource_id: resource.id,
              account_id: accountId,
              status: 'compliant',
              detail: `Control plane ACL is enabled and restricted to: ${allCidrs.join(', ') || 'no addresses (deny all)'}`,
              evaluated_at: evaluatedAt,
            });
          }
        } catch (e: any) {
          results.push({
            rule_id: rule.id,
            resource_id: resource.id,
            account_id: accountId,
            status: 'not_applicable',
            detail: `Could not fetch control plane ACL: ${e?.message || 'unknown error'}`,
            evaluated_at: evaluatedAt,
          });
        }
      }
      continue;
    }

    const applicableResources = resources.filter(r =>
      rule.resource_types.includes(r.resource_type)
    );

    for (const resource of applicableResources) {
      let status: string = 'compliant';
      let detail: string = 'Passed';

      switch (rule.condition_type) {
        case 'firewall_attached': {
          const attachedFws: any[] = resource.specs?.attached_firewalls || [];
          const linodeId = parseInt(resource.resource_id, 10);
          const viaEntity = firewallResources.filter(fw =>
            (fw.specs?.entities || []).some((e: any) => e.id === linodeId)
          );
          const allFws = [
            ...attachedFws,
            ...viaEntity
              .filter(fw => !attachedFws.some((a: any) => a.id === parseInt(fw.resource_id, 10)))
              .map(fw => ({ id: parseInt(fw.resource_id, 10), label: fw.label, status: fw.status })),
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
          detail = count > 0
            ? `Attached to ${count} Linode(s).`
            : 'Firewall has no attached Linodes.';
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
          if (violations.length > 0) {
            status = 'non_compliant';
            detail = violations.join('; ');
          } else if (resource.specs?.inbound_policy === 'ACCEPT' && inboundRules.length === 0) {
            status = 'non_compliant';
            detail = 'Inbound policy is ACCEPT with no rules — all traffic allowed.';
          } else {
            status = 'compliant';
            detail = 'No unrestricted inbound access detected.';
          }
          break;
        }
        case 'min_node_count': {
          const minCount: number = rule.condition_config?.min_count ?? 2;
          const nodeCount = resource.specs?.node_count ?? resource.specs?.nodes?.length ?? 1;
          status = nodeCount >= minCount ? 'compliant' : 'non_compliant';
          detail = nodeCount >= minCount
            ? `Cluster has ${nodeCount} node(s).`
            : `Cluster has ${nodeCount} node(s); minimum required is ${minCount}.`;
          break;
        }
        case 'lke_control_plane_ha': {
          const ha: boolean = resource.specs?.high_availability ?? false;
          if (ha) {
            status = 'compliant';
            detail = 'Control plane high availability is enabled for this cluster.';
          } else {
            status = 'non_compliant';
            detail = 'Control plane high availability is not enabled. Enable HA to ensure the API server remains available during node failures.';
          }
          break;
        }
        case 'lke_audit_logs_enabled': {
          const auditLogs: boolean | null = resource.specs?.audit_logs_enabled ?? null;
          if (auditLogs === null) {
            status = 'not_applicable';
            detail = 'Audit logs status not available. Re-sync to fetch the latest cluster data.';
          } else if (auditLogs === true) {
            status = 'compliant';
            detail = 'Control plane audit logs are enabled for this cluster.';
          } else {
            status = 'non_compliant';
            detail = 'Control plane audit logs are disabled. Enable audit logging to track API activity for security and compliance purposes.';
          }
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

              // Tags are plain strings. Format: "key" or "key:value"
              // A tag matches the key if it equals the key (case-insensitive)
              // or starts with "key:" (prefix match)
              const matchingTag = tags.find(t => {
                const tLower = t.toLowerCase();
                return tLower === keyLower || tLower.startsWith(keyLower + ':');
              });

              if (!matchingTag) {
                missing.push(req.key);
              } else if (req.value && req.value !== '*') {
                // Value check: extract the part after the first ':'
                const colonIdx = matchingTag.indexOf(':');
                const tagValue = colonIdx !== -1 ? matchingTag.slice(colonIdx + 1).trim() : null;
                if (tagValue === null || tagValue.toLowerCase() !== req.value.toLowerCase()) {
                  wrongValue.push(`${req.key} (expected "${req.value}", found "${tagValue ?? matchingTag}")`);
                }
              }
              // req.value === '*' or empty means any value is accepted — just presence of the key prefix
            }

            if (missing.length > 0 || wrongValue.length > 0) {
              status = 'non_compliant';
              const parts: string[] = [];
              if (missing.length > 0) parts.push(`Missing tags: ${missing.join(', ')}`);
              if (wrongValue.length > 0) parts.push(`Wrong values: ${wrongValue.join('; ')}`);
              detail = parts.join('. ');
            } else {
              status = 'compliant';
              detail = `All required tags present: ${requiredTags.map(t => {
                if (!t.value || t.value === '*') return `${t.key}:*`;
                return `${t.key}:${t.value}`;
              }).join(', ')}`;
            }
          } else {
            const minTags: number = rule.condition_config?.min_tags ?? 1;
            status = tags.length >= minTags ? 'compliant' : 'non_compliant';
            detail = tags.length >= minTags
              ? `Has ${tags.length} tag(s): ${tags.join(', ')}`
              : `Has no tags. At least ${minTags} tag(s) required.`;
          }
          break;
        }
        case 'volume_attached': {
          const isAttached = !!resource.specs?.linode_id;
          status = isAttached ? 'compliant' : 'non_compliant';
          detail = isAttached
            ? `Attached to Linode ID ${resource.specs.linode_id}.`
            : 'Volume is not attached to any Linode.';
          break;
        }
        case 'bucket_acl_check': {
          const acl: string | null = resource.specs?.acl ?? null;
          if (acl === null) {
            status = 'not_applicable';
            detail = 'ACL data not available. Re-sync resources to fetch bucket access settings.';
            break;
          }
          const forbiddenAcls: string[] = rule.condition_config?.forbidden_acls || ['public-read', 'public-read-write', 'authenticated-read'];
          const requiredAcl: string | null = rule.condition_config?.required_acl || null;
          if (requiredAcl && acl !== requiredAcl) {
            status = 'non_compliant';
            detail = `Bucket ACL is "${acl}", expected "${requiredAcl}".`;
          } else if (forbiddenAcls.includes(acl)) {
            status = 'non_compliant';
            detail = `Bucket ACL is "${acl}", which is not permitted.`;
          } else {
            status = 'compliant';
            detail = `Bucket ACL is "${acl}".`;
          }
          break;
        }
        case 'bucket_cors_check': {
          const corsEnabled: boolean | null = resource.specs?.cors_enabled ?? null;
          if (corsEnabled === null) {
            status = 'not_applicable';
            detail = 'CORS data not available. Re-sync resources to fetch bucket access settings.';
            break;
          }
          const requireCorsDisabled: boolean = rule.condition_config?.require_cors_disabled ?? false;
          const requireCorsEnabled: boolean = rule.condition_config?.require_cors_enabled ?? false;
          if (requireCorsDisabled && corsEnabled) {
            status = 'non_compliant';
            detail = 'CORS is enabled on this bucket; it must be disabled.';
          } else if (requireCorsEnabled && !corsEnabled) {
            status = 'non_compliant';
            detail = 'CORS is disabled on this bucket; it must be enabled.';
          } else {
            status = 'compliant';
            detail = `CORS is ${corsEnabled ? 'enabled' : 'disabled'}.`;
          }
          break;
        }
        case 'firewall_rules_check': {
          const linodeId2 = parseInt(resource.resource_id, 10);
          const directFws: any[] = resource.specs?.attached_firewalls || [];
          const viaEntityFws = firewallResources.filter(fw =>
            (fw.specs?.entities || []).some((e: any) => e.id === linodeId2)
          );
          const allFwResources = [
            ...directFws.map((af: any) => firewallResources.find(fw => parseInt(fw.resource_id, 10) === af.id)).filter(Boolean),
            ...viaEntityFws.filter(fw => !directFws.some((af: any) => af.id === parseInt(fw.resource_id, 10))),
          ];

          if (allFwResources.length === 0) {
            status = 'non_compliant';
            detail = 'No firewall is attached to this Linode.';
            break;
          }

          const cfg = rule.condition_config || {};
          const requiredInboundPolicy: string | null = cfg.required_inbound_policy || null;
          const requiredOutboundPolicy: string | null = cfg.required_outbound_policy || null;
          const blockedPorts: number[] = cfg.blocked_ports || [];
          const allowedSourceIPs: string[] = cfg.allowed_source_ips || [];
          const requireNoOpenPorts: boolean = cfg.require_no_open_ports ?? false;

          const fwViolations: string[] = [];

          for (const fw of allFwResources) {
            const specs = fw.specs || {};
            const inboundPolicy: string = (specs.inbound_policy || 'ACCEPT').toUpperCase();
            const outboundPolicy: string = (specs.outbound_policy || 'ACCEPT').toUpperCase();
            const inboundRules: any[] = specs.inbound_rules_detail || [];

            if (requiredInboundPolicy && inboundPolicy !== requiredInboundPolicy.toUpperCase()) {
              fwViolations.push(`Firewall "${fw.label}": inbound policy is ${inboundPolicy}, expected ${requiredInboundPolicy.toUpperCase()}`);
            }
            if (requiredOutboundPolicy && outboundPolicy !== requiredOutboundPolicy.toUpperCase()) {
              fwViolations.push(`Firewall "${fw.label}": outbound policy is ${outboundPolicy}, expected ${requiredOutboundPolicy.toUpperCase()}`);
            }

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
                    if (s.includes('-')) {
                      const [lo, hi] = s.split('-').map(Number);
                      return p >= lo && p <= hi;
                    }
                    return parseInt(s, 10) === p;
                  });
                  if (portMatches) {
                    fwViolations.push(`Firewall "${fw.label}": port ${p} is allowed inbound (rule: ${r.label || 'unnamed'})`);
                  }
                }
              }

              if (requireNoOpenPorts && isOpenToAll) {
                fwViolations.push(`Firewall "${fw.label}": rule "${r.label || 'unnamed'}" allows unrestricted inbound traffic`);
              }

              if (allowedSourceIPs.length > 0 && !isOpenToAll) {
                const allIPs = [...ipv4, ...ipv6];
                const hasDisallowed = allIPs.some(ip => !allowedSourceIPs.includes(ip));
                if (hasDisallowed) {
                  fwViolations.push(`Firewall "${fw.label}": rule "${r.label || 'unnamed'}" allows traffic from IPs not in the allowed list`);
                }
              }
            }
          }

          if (fwViolations.length > 0) {
            status = 'non_compliant';
            detail = fwViolations.join('; ');
          } else {
            status = 'compliant';
            const fwNames = allFwResources.map(fw => fw.label).join(', ');
            detail = `Firewall rules compliant (${fwNames})`;
          }
          break;
        }
        case 'approved_regions': {
          const approvedRegions: string[] = rule.condition_config?.approved_regions || [];
          const resourceRegion: string = resource.region || '';
          if (approvedRegions.length === 0) {
            status = 'not_applicable';
            detail = 'No approved regions configured for this rule.';
          } else if (!resourceRegion) {
            status = 'not_applicable';
            detail = 'Resource has no region information.';
          } else if (approvedRegions.includes(resourceRegion)) {
            status = 'compliant';
            detail = `Region "${resourceRegion}" is approved.`;
          } else {
            status = 'non_compliant';
            detail = `Region "${resourceRegion}" is not in the approved list: ${approvedRegions.join(', ')}.`;
          }
          break;
        }
        case 'db_public_access': {
          const publicAccess: boolean | null = resource.specs?.public_access ?? null;
          if (publicAccess === null) {
            status = 'not_applicable';
            detail = 'Public access data not available. Re-sync to fetch the latest database settings.';
            break;
          }
          const allowPublicAccess: boolean = rule.condition_config?.allow_public_access ?? false;
          if (publicAccess && !allowPublicAccess) {
            status = 'non_compliant';
            detail = 'Database has public access enabled — it is reachable outside the VPC.';
          } else if (!publicAccess) {
            status = 'compliant';
            detail = 'Database does not have public access enabled.';
          } else {
            status = 'compliant';
            detail = 'Database has public access enabled (permitted by rule configuration).';
          }
          break;
        }
        case 'db_allowlist_check': {
          const allowList: string[] = resource.specs?.allow_list ?? [];
          if (allowList === null || resource.specs?.allow_list === undefined) {
            status = 'not_applicable';
            detail = 'Allow list data not available. Re-sync to fetch the latest database settings.';
            break;
          }
          const forbiddenCidrs: string[] = rule.condition_config?.forbidden_cidrs || ['0.0.0.0/0', '::/0'];
          const requireNonEmpty: boolean = rule.condition_config?.require_non_empty ?? false;

          const violations: string[] = [];

          if (requireNonEmpty && allowList.length === 0) {
            violations.push('Allow list is empty — all IPs are permitted by default.');
          }

          for (const cidr of allowList) {
            if (forbiddenCidrs.includes(cidr)) {
              violations.push(`Unrestricted CIDR "${cidr}" is in the allow list.`);
            }
          }

          if (violations.length > 0) {
            status = 'non_compliant';
            detail = violations.join(' ');
          } else {
            status = 'compliant';
            if (allowList.length === 0) {
              detail = 'Allow list is empty (access restricted by default for this database).';
            } else {
              detail = `Allow list contains ${allowList.length} entr${allowList.length === 1 ? 'y' : 'ies'}: ${allowList.join(', ')}.`;
            }
          }
          break;
        }
        case 'linode_backups_enabled': {
          const backupsEnabled: boolean | null = resource.specs?.backups_enabled ?? null;
          if (backupsEnabled === null) {
            status = 'not_applicable';
            detail = 'Backup status not available. Re-sync to fetch the latest instance data.';
          } else if (backupsEnabled) {
            status = 'compliant';
            detail = 'Backups are enabled for this Linode.';
          } else {
            status = 'non_compliant';
            detail = 'Backups are not enabled for this Linode.';
          }
          break;
        }
        case 'linode_backup_recency': {
          const lastSuccessful: string | null = resource.specs?.backups_last_successful ?? null;
          const backupsEnabled: boolean = resource.specs?.backups_enabled ?? false;
          const maxAgeDays: number = rule.condition_config?.max_age_days ?? 7;

          if (!backupsEnabled) {
            status = 'non_compliant';
            detail = `Backups are not enabled for this Linode, so no recent recovery point exists.`;
          } else if (!lastSuccessful) {
            status = 'non_compliant';
            detail = `Backups are enabled but no successful backup has been recorded yet. Re-sync to refresh data.`;
          } else {
            const lastBackupMs = new Date(lastSuccessful).getTime();
            const ageHours = (Date.now() - lastBackupMs) / (1000 * 60 * 60);
            const ageDays = ageHours / 24;
            const lastBackupFormatted = new Date(lastSuccessful).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            if (ageDays <= maxAgeDays) {
              status = 'compliant';
              const hoursAgo = Math.round(ageHours);
              detail = `Last successful backup was ${hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(ageDays)} day(s) ago`} (${lastBackupFormatted}), within the ${maxAgeDays}-day window.`;
            } else {
              status = 'non_compliant';
              detail = `Last successful backup was ${Math.round(ageDays)} day(s) ago (${lastBackupFormatted}), which exceeds the required ${maxAgeDays}-day window.`;
            }
          }
          break;
        }
        case 'linode_disk_encryption': {
          const diskEncryption: string | null = resource.specs?.disk_encryption ?? null;
          if (diskEncryption === null) {
            status = 'not_applicable';
            detail = 'Disk encryption status not available. Re-sync to fetch the latest instance data.';
          } else if (diskEncryption === 'enabled') {
            status = 'compliant';
            detail = 'Disk encryption is enabled for this Linode.';
          } else {
            status = 'non_compliant';
            detail = `Disk encryption is "${diskEncryption}". It must be set to "enabled".`;
          }
          break;
        }
        case 'linode_lock_configured': {
          const locks: string[] = resource.specs?.locks || [];
          const requiredLockTypes: string[] = rule.condition_config?.required_lock_types || [];
          if (locks.length === 0) {
            status = 'non_compliant';
            detail = requiredLockTypes.length > 0
              ? `No lock configured. Required: ${requiredLockTypes.join(', ')}.`
              : 'No deletion lock is configured for this Linode.';
          } else if (requiredLockTypes.length > 0) {
            const missing = requiredLockTypes.filter(t => !locks.includes(t));
            if (missing.length > 0) {
              status = 'non_compliant';
              detail = `Lock(s) present (${locks.join(', ')}) but missing required type(s): ${missing.join(', ')}.`;
            } else {
              status = 'compliant';
              detail = `Required lock(s) configured: ${locks.join(', ')}.`;
            }
          } else {
            status = 'compliant';
            detail = `Deletion lock is configured: ${locks.join(', ')}.`;
          }
          break;
        }
        case 'linode_not_offline': {
          const linodeStatus: string = resource.specs?.status || '';
          if (!linodeStatus) {
            status = 'not_applicable';
            detail = 'Instance status not available. Re-sync to fetch the latest data.';
          } else if (linodeStatus === 'offline') {
            status = 'non_compliant';
            detail = 'Linode is offline.';
          } else {
            status = 'compliant';
            detail = `Linode status is "${linodeStatus}".`;
          }
          break;
        }
        case 'nodebalancer_protocol_check': {
          const nbPortConfigs: Array<{ id: number; port: number; protocol: string }> = resource.specs?.configs || [];
          if (nbPortConfigs.length === 0) {
            status = 'not_applicable';
            detail = 'No port configurations found. Re-sync to fetch the latest NodeBalancer data.';
            break;
          }
          const allowedProtocols: string[] = rule.condition_config?.allowed_protocols || [];
          const forbiddenProtocols: string[] = rule.condition_config?.forbidden_protocols || [];
          const violations: string[] = [];
          for (const cfg of nbPortConfigs) {
            const proto = (cfg.protocol || '').toLowerCase();
            if (forbiddenProtocols.length > 0 && forbiddenProtocols.includes(proto)) {
              violations.push(`Port ${cfg.port} uses forbidden protocol "${proto}"`);
            } else if (allowedProtocols.length > 0 && !allowedProtocols.includes(proto)) {
              violations.push(`Port ${cfg.port} uses disallowed protocol "${proto}" (allowed: ${allowedProtocols.join(', ')})`);
            }
          }
          if (violations.length > 0) {
            status = 'non_compliant';
            detail = violations.join('; ') + '.';
          } else {
            const summary = nbPortConfigs.map(c => `port ${c.port} (${c.protocol})`).join(', ');
            status = 'compliant';
            detail = `All port configurations use compliant protocols: ${summary}.`;
          }
          break;
        }
        case 'volume_encryption_enabled': {
          const volEncryption: string | null = resource.specs?.encryption ?? null;
          if (volEncryption === null) {
            status = 'not_applicable';
            detail = 'Encryption status not available. Re-sync to fetch the latest volume data.';
          } else if (volEncryption === 'enabled') {
            status = 'compliant';
            detail = 'Disk encryption is enabled for this volume.';
          } else {
            status = 'non_compliant';
            detail = `Disk encryption is "${volEncryption}". It must be set to "enabled" to protect data at rest.`;
          }
          break;
        }
        case 'nodebalancer_port_allowlist': {
          const nbPortConfigs: Array<{ id: number; port: number; protocol: string }> = resource.specs?.configs || [];
          if (nbPortConfigs.length === 0) {
            status = 'not_applicable';
            detail = 'No port configurations found. Re-sync to fetch the latest NodeBalancer data.';
            break;
          }
          const allowedPorts: number[] = rule.condition_config?.allowed_ports || [];
          if (allowedPorts.length === 0) {
            status = 'not_applicable';
            detail = 'No allowed ports configured for this rule.';
            break;
          }
          const portViolations: string[] = [];
          for (const cfg of nbPortConfigs) {
            if (!allowedPorts.includes(cfg.port)) {
              portViolations.push(`Port ${cfg.port} is not in the allowed list`);
            }
          }
          if (portViolations.length > 0) {
            status = 'non_compliant';
            detail = portViolations.join('; ') + `. Allowed: ${allowedPorts.join(', ')}.`;
          } else {
            const summary = nbPortConfigs.map(c => `${c.port}`).join(', ');
            status = 'compliant';
            detail = `All configured ports (${summary}) are in the allowed list.`;
          }
          break;
        }
        case 'firewall_rfc1918_lateral': {
          const sensitivePorts: number[] = rule.condition_config?.sensitive_ports || [22, 3389, 3306, 5432, 5984, 6379, 9200, 27017];
          const inboundRules: any[] = resource.specs?.inbound_rules_detail || [];

          // RFC-1918 private ranges
          const privateRanges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

          function isRfc1918(cidr: string): boolean {
            return privateRanges.includes(cidr) ||
              cidr.startsWith('10.') ||
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
                if (s.includes('-')) {
                  const [lo, hi] = s.split('-').map(Number);
                  return p >= lo && p <= hi;
                }
                return parseInt(s, 10) === p;
              });
              if (portMatches) {
                violations.push(`Rule "${r.label || 'unnamed'}": port ${p} accepts traffic from private range(s) ${privateSourceIps.join(', ')}`);
              }
            }
          }

          if (violations.length > 0) {
            status = 'non_compliant';
            detail = `Potential lateral movement: ${violations.join('; ')}.`;
          } else if (inboundRules.length === 0) {
            status = 'not_applicable';
            detail = 'No inbound rules to evaluate.';
          } else {
            status = 'compliant';
            detail = 'No inbound rules accept RFC-1918 traffic on sensitive ports.';
          }
          break;
        }
        case 'firewall_rule_descriptions': {
          const inboundRules: any[] = resource.specs?.inbound_rules_detail || [];
          const outboundRules: any[] = resource.specs?.outbound_rules_detail || [];
          const allRules = [...inboundRules, ...outboundRules];

          if (allRules.length === 0) {
            status = 'not_applicable';
            detail = 'No rules to evaluate.';
            break;
          }

          const undescribed = allRules.filter(r => !r.description || r.description.trim() === '');

          if (undescribed.length > 0) {
            status = 'non_compliant';
            detail = `${undescribed.length} rule${undescribed.length !== 1 ? 's are' : ' is'} missing a description: ${undescribed.map(r => `"${r.label || 'unnamed'}"`).join(', ')}.`;
          } else {
            status = 'compliant';
            detail = `All ${allRules.length} rule${allRules.length !== 1 ? 's' : ''} have descriptions set.`;
          }
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
              if (seen.has(fp)) {
                duplicates.push(`${direction} rule "${label}" is identical to "${seen.get(fp)}"`);
              } else {
                seen.set(fp, label);
              }
            }
          }

          findDuplicates(inboundRules, 'Inbound');
          findDuplicates(outboundRules, 'Outbound');

          if (inboundRules.length === 0 && outboundRules.length === 0) {
            status = 'not_applicable';
            detail = 'No rules to evaluate.';
          } else if (duplicates.length > 0) {
            status = 'non_compliant';
            detail = `Duplicate rules detected: ${duplicates.join('; ')}.`;
          } else {
            const total = inboundRules.length + outboundRules.length;
            status = 'compliant';
            detail = `No duplicate rules found across ${total} rule${total !== 1 ? 's' : ''}.`;
          }
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
            if (ports === '') return true;
            if (ports === '1-65535') return true;
            return false;
          }

          if (checkInbound) {
            for (const r of inboundRules) {
              if (!actionsToCheck.includes((r.action || '').toUpperCase())) continue;
              if (isAllPorts(r)) {
                violations.push(`Inbound rule "${r.label || 'unnamed'}": allows all ports (protocol: ${(r.protocol || 'ALL').toUpperCase()}, ports: "${r.ports || 'any'}")`);
              }
            }
          }

          if (checkOutbound) {
            for (const r of outboundRules) {
              if (!actionsToCheck.includes((r.action || '').toUpperCase())) continue;
              if (isAllPorts(r)) {
                violations.push(`Outbound rule "${r.label || 'unnamed'}": allows all ports (protocol: ${(r.protocol || 'ALL').toUpperCase()}, ports: "${r.ports || 'any'}")`);
              }
            }
          }

          const totalChecked = (checkInbound ? inboundRules.length : 0) + (checkOutbound ? outboundRules.length : 0);

          if (totalChecked === 0) {
            status = 'not_applicable';
            detail = 'No rules to evaluate.';
          } else if (violations.length > 0) {
            status = 'non_compliant';
            detail = violations.join('; ');
          } else {
            status = 'compliant';
            detail = `No rules allow all ports across ${totalChecked} rule${totalChecked !== 1 ? 's' : ''} checked.`;
          }
          break;
        }
        case 'linode_plan_tier_by_tag': {
          const tagKey: string = (rule.condition_config?.tag || '').toLowerCase();
          const tagValue: string = (rule.condition_config?.tag_value || '').toLowerCase();
          const approvedTiers: string[] = rule.condition_config?.approved_tiers || [];

          if (!tagKey || approvedTiers.length === 0) {
            status = 'not_applicable';
            detail = 'Rule is not fully configured (tag key or approved tiers missing).';
            break;
          }

          const tags: string[] = resource.specs?.tags || [];
          const matchingTag = tags.find(t => {
            const tLower = t.toLowerCase();
            if (tagValue) {
              return tLower === `${tagKey}:${tagValue}` || tLower === tagKey && !tagValue;
            }
            return tLower === tagKey || tLower.startsWith(`${tagKey}:`);
          });

          if (!matchingTag) {
            status = 'not_applicable';
            detail = `Linode does not have the tag "${tagKey}${tagValue ? `:${tagValue}` : ''}" — rule does not apply.`;
            break;
          }

          const planType: string = resource.plan_type || '';
          const tierFromPlan = planType.replace(/^g\d+-/, '').replace(/-\d+$/, '');

          const isApproved = approvedTiers.some(tier => tierFromPlan.startsWith(tier));
          if (isApproved) {
            status = 'compliant';
            detail = `Plan "${planType}" (tier: ${tierFromPlan}) is in the approved tiers: ${approvedTiers.join(', ')}.`;
          } else {
            status = 'non_compliant';
            detail = `Plan "${planType}" (tier: ${tierFromPlan}) is not in the approved tiers: ${approvedTiers.join(', ')}. Upgrade to a ${approvedTiers.join(' or ')} instance.`;
          }
          break;
        }
        default:
          status = 'not_applicable';
          detail = 'Rule condition not recognized.';
      }

      results.push({
        rule_id: rule.id,
        resource_id: resource.id,
        account_id: accountId,
        status,
        detail,
        evaluated_at: evaluatedAt,
      });
    }
  }

  // Evaluate composite rules (second pass — depends on non-composite results above)
  for (const rule of compositeRules) {
    const cfg = rule.condition_config || {};
    const operator: string = cfg.operator || 'AND';
    const ruleIds: string[] = cfg.rule_ids || [];
    const ifRuleId: string | null = cfg.if_rule_id || null;
    const thenRuleId: string | null = cfg.then_rule_id || null;

    if (operator === 'IF_THEN') {
      // Condition: for each resource, if IF rule is non_compliant then THEN rule must be compliant
      const ifRule = rules.find(r => r.id === ifRuleId);
      const thenRule = rules.find(r => r.id === thenRuleId);
      if (!ifRule || !thenRule) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'IF_THEN composite rule references missing sub-rules.', evaluated_at: evaluatedAt });
        continue;
      }
      const allResourceIds = new Set([
        ...results.filter(r => r.rule_id === ifRuleId && r.resource_id).map(r => r.resource_id),
        ...results.filter(r => r.rule_id === thenRuleId && r.resource_id).map(r => r.resource_id),
      ]);
      if (allResourceIds.size === 0) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No resources to evaluate for IF_THEN composite rule.', evaluated_at: evaluatedAt });
        continue;
      }
      for (const rid of allResourceIds) {
        const ifResult = results.find(r => r.rule_id === ifRuleId && r.resource_id === rid);
        const thenResult = results.find(r => r.rule_id === thenRuleId && r.resource_id === rid);
        const ifTriggered = ifResult?.status === 'non_compliant';
        const thenPassed = thenResult?.status === 'compliant';
        if (!ifTriggered) {
          results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: 'not_applicable', detail: `IF condition (${ifRule.name}) not triggered — rule does not apply.`, evaluated_at: evaluatedAt });
        } else if (thenPassed) {
          results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: 'compliant', detail: `IF condition (${ifRule.name}) triggered and THEN condition (${thenRule.name}) is satisfied.`, evaluated_at: evaluatedAt });
        } else {
          results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: 'non_compliant', detail: `IF condition (${ifRule.name}) triggered but THEN condition (${thenRule.name}) failed.`, evaluated_at: evaluatedAt });
        }
      }
      continue;
    }

    if (operator === 'NOT') {
      const targetId = ruleIds[0];
      if (!targetId) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'NOT composite rule has no sub-rule specified.', evaluated_at: evaluatedAt });
        continue;
      }
      const targetResults = results.filter(r => r.rule_id === targetId);
      if (targetResults.length === 0) {
        results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No results found for sub-rule.', evaluated_at: evaluatedAt });
        continue;
      }
      for (const sub of targetResults) {
        const flipped = sub.status === 'compliant' ? 'non_compliant' : sub.status === 'non_compliant' ? 'compliant' : 'not_applicable';
        results.push({ rule_id: rule.id, resource_id: sub.resource_id, account_id: accountId, status: flipped, detail: `NOT(${sub.detail})`, evaluated_at: evaluatedAt });
      }
      continue;
    }

    // AND / OR — collect resource IDs that appear in sub-rule results
    const subResults = results.filter(r => ruleIds.includes(r.rule_id));
    const allResourceIds = new Set(subResults.filter(r => r.resource_id).map(r => r.resource_id));
    const accountLevelSubResults = subResults.filter(r => !r.resource_id);

    if (allResourceIds.size === 0 && accountLevelSubResults.length === 0) {
      results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: 'not_applicable', detail: 'No sub-rule results to combine.', evaluated_at: evaluatedAt });
      continue;
    }

    if (allResourceIds.size > 0) {
      for (const rid of allResourceIds) {
        const subForResource = ruleIds.map(subId => results.find(r => r.rule_id === subId && r.resource_id === rid));
        const statuses = subForResource.map(r => r?.status ?? 'not_applicable');
        let combinedStatus: string;
        let detail: string;
        const subRuleNames = ruleIds.map(id => rules.find(r => r.id === id)?.name ?? id);
        if (operator === 'AND') {
          combinedStatus = statuses.every(s => s === 'compliant') ? 'compliant' : statuses.some(s => s === 'non_compliant') ? 'non_compliant' : 'not_applicable';
          detail = statuses.every(s => s === 'compliant')
            ? `All conditions passed: ${subRuleNames.join(', ')}`
            : `AND failed — sub-rule statuses: ${subRuleNames.map((n, i) => `${n}: ${statuses[i]}`).join('; ')}`;
        } else {
          combinedStatus = statuses.some(s => s === 'compliant') ? 'compliant' : statuses.every(s => s === 'not_applicable') ? 'not_applicable' : 'non_compliant';
          detail = statuses.some(s => s === 'compliant')
            ? `OR passed — at least one condition met: ${subRuleNames.join(', ')}`
            : `OR failed — no conditions met: ${subRuleNames.map((n, i) => `${n}: ${statuses[i]}`).join('; ')}`;
        }
        results.push({ rule_id: rule.id, resource_id: rid, account_id: accountId, status: combinedStatus, detail, evaluated_at: evaluatedAt });
      }
    } else {
      const statuses = accountLevelSubResults.map(r => r.status);
      const subRuleNames = ruleIds.map(id => rules.find(r => r.id === id)?.name ?? id);
      let combinedStatus: string;
      let detail: string;
      if (operator === 'AND') {
        combinedStatus = statuses.every(s => s === 'compliant') ? 'compliant' : statuses.some(s => s === 'non_compliant') ? 'non_compliant' : 'not_applicable';
        detail = `AND: ${subRuleNames.map((n, i) => `${n}: ${statuses[i]}`).join('; ')}`;
      } else {
        combinedStatus = statuses.some(s => s === 'compliant') ? 'compliant' : statuses.every(s => s === 'not_applicable') ? 'not_applicable' : 'non_compliant';
        detail = `OR: ${subRuleNames.map((n, i) => `${n}: ${statuses[i]}`).join('; ')}`;
      }
      results.push({ rule_id: rule.id, resource_id: null, account_id: accountId, status: combinedStatus, detail, evaluated_at: evaluatedAt });
    }
  }

  // Restore acknowledgements for results that match a previously-acknowledged rule+resource pair
  const resultsWithAcks = results.map(r => {
    const key = `${r.rule_id}:${r.resource_id ?? ''}`;
    const ack = ackMap.get(key);
    if (ack) {
      return { ...r, acknowledged: true, acknowledged_at: ack.acknowledged_at, acknowledged_note: ack.acknowledged_note, acknowledged_by: ack.acknowledged_by };
    }
    return { ...r, acknowledged: false, acknowledged_at: null, acknowledged_note: null, acknowledged_by: null };
  });

  if (resultsWithAcks.length > 0) {
    const { error: insertError } = await supabase.from('compliance_results').insert(resultsWithAcks);
    if (insertError) throw insertError;
  }

  await supabase
    .from('linode_accounts')
    .update({ last_evaluated_at: evaluatedAt })
    .eq('id', accountId);

  // Build aggregate score metrics (excluding acknowledged results from the score)
  const unacknowledged = resultsWithAcks.filter(r => !r.acknowledged);
  const compliant = unacknowledged.filter(r => r.status === 'compliant').length;
  const nonCompliant = unacknowledged.filter(r => r.status === 'non_compliant').length;
  const notApplicable = unacknowledged.filter(r => r.status === 'not_applicable').length;
  const acknowledged = resultsWithAcks.filter(r => r.acknowledged).length;
  const scoreable = compliant + nonCompliant;
  const complianceScore = scoreable > 0 ? Math.round((compliant / scoreable) * 10000) / 100 : null;

  // Build per-rule breakdown for the history record
  const ruleBreakdown = rules.map(rule => {
    const ruleResults = unacknowledged.filter(r => r.rule_id === rule.id);
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      compliant: ruleResults.filter(r => r.status === 'compliant').length,
      non_compliant: ruleResults.filter(r => r.status === 'non_compliant').length,
      not_applicable: ruleResults.filter(r => r.status === 'not_applicable').length,
    };
  });

  // Persist historical score snapshot
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

  // Persist per-resource compliance snapshots
  const resourceIds = Array.from(new Set(
    resultsWithAcks.filter(r => r.resource_id != null).map(r => r.resource_id as string)
  ));
  if (resourceIds.length > 0) {
    const ruleNameMap = new Map(rules.map(r => [r.id, { name: r.name, severity: r.severity }]));
    const perResourceRows = resourceIds.map(resourceId => {
      const resResults = resultsWithAcks.filter(r => r.resource_id === resourceId);
      return {
        account_id: accountId,
        resource_id: resourceId,
        evaluated_at: evaluatedAt,
        results: resResults.map(r => ({
          rule_id: r.rule_id,
          rule_name: ruleNameMap.get(r.rule_id)?.name ?? '',
          severity: ruleNameMap.get(r.rule_id)?.severity ?? 'info',
          status: r.status,
          detail: r.detail ?? null,
          acknowledged: r.acknowledged,
        })),
      };
    });
    await supabase.from('resource_compliance_history').insert(perResourceRows);
  }

  return {
    evaluated: resultsWithAcks.length,
    compliant,
    non_compliant: nonCompliant,
  };
}

export async function getComplianceResults(accountId: string) {
  const { data, error } = await supabase
    .from('compliance_results')
    .select('*, compliance_rules(*), resources(*), acknowledger:acknowledged_by(id, email, full_name)')
    .eq('account_id', accountId)
    .order('evaluated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getComplianceScoreHistory(accountId: string, limit = 90) {
  const { data, error } = await supabase
    .from('compliance_score_history')
    .select('*')
    .eq('account_id', accountId)
    .order('evaluated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse();
}

export async function getResourceComplianceHistory(resourceId: string, limit = 90) {
  const { data, error } = await supabase
    .from('resource_compliance_history')
    .select('id, resource_id, evaluated_at, results')
    .eq('resource_id', resourceId)
    .order('evaluated_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getComplianceSummary(accountId: string) {
  const { data, error } = await supabase
    .from('compliance_results')
    .select('status')
    .eq('account_id', accountId);

  if (error) throw error;
  const total = (data || []).length;
  const compliant = (data || []).filter(r => r.status === 'compliant').length;
  const nonCompliant = (data || []).filter(r => r.status === 'non_compliant').length;
  const notApplicable = (data || []).filter(r => r.status === 'not_applicable').length;
  return { total, compliant, non_compliant: nonCompliant, not_applicable: notApplicable };
}


export async function acknowledgeComplianceResult(resultId: string, note?: string) {
  const userId = getCurrentUserId();
  const { error } = await supabase
    .from('compliance_results')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_note: note ?? null,
      acknowledged_by: userId,
    })
    .eq('id', resultId);
  if (error) throw error;
}

export async function unacknowledgeComplianceResult(resultId: string) {
  const { error } = await supabase
    .from('compliance_results')
    .update({ acknowledged: false, acknowledged_at: null, acknowledged_note: null, acknowledged_by: null })
    .eq('id', resultId);
  if (error) throw error;
}

export interface ComplianceResultNote {
  id: string;
  compliance_result_id: string;
  account_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
  author: { id: string; email: string; full_name: string | null } | null;
}

export async function getComplianceResultNotes(resultId: string): Promise<ComplianceResultNote[]> {
  const { data, error } = await supabase
    .from('compliance_result_notes')
    .select('*, author:created_by(id, email, full_name)')
    .eq('compliance_result_id', resultId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as ComplianceResultNote[];
}

export async function addComplianceResultNote(resultId: string, accountId: string, note: string): Promise<ComplianceResultNote> {
  const userId = getCurrentUserId();

  const { data, error } = await supabase
    .from('compliance_result_notes')
    .insert({
      compliance_result_id: resultId,
      account_id: accountId,
      note: note.trim(),
      created_by: userId,
    })
    .select('*, author:created_by(id, email, full_name)')
    .single();
  if (error) throw error;
  return data as ComplianceResultNote;
}

export async function deleteComplianceResultNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('compliance_result_notes')
    .delete()
    .eq('id', noteId);
  if (error) throw error;
}

// ============================================================
// Config: Relationships
// ============================================================

export async function getResourceRelationships(accountId: string) {
  const { data, error } = await supabase
    .from('resource_relationships')
    .select('*, metadata, source:source_id(id, resource_type, label, status, region, specs), target:target_id(id, resource_type, label, status, region, specs)')
    .eq('account_id', accountId);

  if (error) throw error;
  return data || [];
}

// ============================================================
// Config: Events
// ============================================================

export async function getLinodeEvents(accountId: string, limit = 200) {
  const { data, error } = await supabase
    .from('linode_events')
    .select('*')
    .eq('account_id', accountId)
    .order('event_created', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ============================================================
// Compliance Profiles
// ============================================================

export interface ComplianceProfile {
  id: string;
  name: string;
  slug: string;
  description: string;
  tier: string;
  version: string;
  icon: string;
  rule_condition_types: string[];
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountComplianceProfile {
  id: string;
  account_id: string;
  profile_id: string;
  activated_at: string;
  created_at: string;
  profile?: ComplianceProfile;
}

export async function getComplianceProfiles(): Promise<ComplianceProfile[]> {
  const { data, error } = await supabase
    .from('compliance_profiles')
    .select('*')
    .order('tier', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getActiveProfileForAccount(accountId: string): Promise<AccountComplianceProfile | null> {
  const { data, error } = await supabase
    .from('account_compliance_profiles')
    .select('*, profile:profile_id(*)')
    .eq('account_id', accountId)
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setActiveProfileForAccount(accountId: string, profileId: string): Promise<void> {
  const { error: delError } = await supabase
    .from('account_compliance_profiles')
    .delete()
    .eq('account_id', accountId);
  if (delError) throw delError;

  const { error } = await supabase
    .from('account_compliance_profiles')
    .insert({ account_id: accountId, profile_id: profileId, activated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function clearActiveProfileForAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('account_compliance_profiles')
    .delete()
    .eq('account_id', accountId);
  if (error) throw error;
}

// ============================================================
// Reports
// ============================================================

export async function getReportComplianceScoreHistory(accountId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('compliance_score_history')
    .select('*')
    .eq('account_id', accountId)
    .gte('evaluated_at', since.toISOString())
    .order('evaluated_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getReportCostHistory(accountId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('cost_summary')
    .select('*')
    .eq('account_id', accountId)
    .gte('cost_date', since.toISOString().split('T')[0])
    .order('cost_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getReportResourceHistory(accountId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('resource_snapshots')
    .select('resource_type, synced_at, monthly_cost')
    .eq('account_id', accountId)
    .gte('synced_at', since.toISOString())
    .order('synced_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getReportComplianceResultsLatest(accountId: string) {
  const { data, error } = await supabase
    .from('compliance_results')
    .select('*, compliance_rules(name, severity, resource_types, condition_type), resources(resource_type, label, region), acknowledger:acknowledged_by(id, email, full_name)')
    .eq('account_id', accountId)
    .order('evaluated_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];

  const acknowledgedIds = rows.filter((r: any) => r.acknowledged).map((r: any) => r.id as string);
  if (acknowledgedIds.length > 0) {
    const { data: notesData } = await supabase
      .from('compliance_result_notes')
      .select('id, compliance_result_id, note, created_at, author:created_by(email, full_name)')
      .in('compliance_result_id', acknowledgedIds)
      .order('created_at', { ascending: true });
    if (notesData && notesData.length > 0) {
      const notesByResult: Record<string, any[]> = {};
      for (const n of notesData) {
        if (!notesByResult[n.compliance_result_id]) notesByResult[n.compliance_result_id] = [];
        notesByResult[n.compliance_result_id].push(n);
      }
      for (const row of rows as any[]) {
        row.notes = notesByResult[row.id] || [];
      }
    }
  }

  return rows;
}

export async function getReportResourceComplianceHistory(accountId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('compliance_score_history')
    .select('evaluated_at, compliance_score, compliant_count, non_compliant_count, rule_breakdown')
    .eq('account_id', accountId)
    .gte('evaluated_at', since.toISOString())
    .order('evaluated_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
