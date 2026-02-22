/*
  # AWS Config-like Feature Tables

  ## Overview
  Adds four new tables to support configuration tracking, compliance rules,
  resource relationships, and event timelines — similar to AWS Config.

  ## New Tables

  ### 1. resource_snapshots
  Stores a full snapshot of each resource's specs/state on every sync.
  Used to build change history and diff consecutive states.
  - `resource_id` (FK to resources.id)
  - `account_id` (FK to linode_accounts.id)
  - `resource_type`, `label`, `region`, `plan_type`, `monthly_cost`, `status`
  - `specs` jsonb — full specs blob at time of snapshot
  - `diff` jsonb — changes from previous snapshot (null for first snapshot)
  - `synced_at` — when this snapshot was taken

  ### 2. compliance_rules
  User-defined or built-in rules evaluated against resources each sync.
  - `name`, `description`
  - `resource_types` text[] — which resource types this rule applies to
  - `condition_type` — e.g. 'firewall_attached', 'no_open_inbound', 'min_nodes', 'has_tag', 'custom'
  - `condition_config` jsonb — parameters for the condition
  - `severity` — 'critical', 'warning', 'info'
  - `is_active` boolean
  - `is_builtin` boolean — system-provided rules vs user-created

  ### 3. compliance_results
  Result of evaluating a compliance rule against a specific resource.
  - `rule_id` (FK to compliance_rules.id)
  - `resource_id` (FK to resources.id)
  - `account_id` (FK to linode_accounts.id)
  - `status` — 'compliant', 'non_compliant', 'not_applicable'
  - `detail` text — human-readable explanation of why it passed/failed
  - `evaluated_at`

  ### 4. resource_relationships
  Maps relationships between resources (firewall→linode, volume→linode, etc.)
  - `source_id`, `target_id` (both FK to resources.id)
  - `account_id`
  - `relationship_type` — e.g. 'protects', 'attached_to', 'load_balances', 'hosts_node'
  - `synced_at`

  ### 5. linode_events
  Stores events fetched from /v4/account/events per account.
  - `account_id` (FK to linode_accounts.id)
  - `event_id` — Linode's numeric event ID
  - `action` — e.g. 'linode_boot', 'linode_shutdown', 'firewall_rules_update'
  - `entity_id`, `entity_type`, `entity_label`, `entity_url`
  - `secondary_entity_id`, `secondary_entity_type`, `secondary_entity_label`
  - `message`, `status`, `username`, `duration`, `percent_complete`
  - `seen` boolean
  - `event_created` — when the event happened on Linode's side
  - UNIQUE(account_id, event_id) to prevent duplicates on re-sync

  ## Security
  All tables have RLS enabled with permissive anon+authenticated policies
  (matching existing patterns in this project).
*/

-- ============================================================
-- 1. resource_snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  label text NOT NULL,
  region text,
  plan_type text,
  monthly_cost numeric DEFAULT 0,
  status text,
  specs jsonb,
  diff jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_snapshots_resource_id ON resource_snapshots(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_account_id ON resource_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_synced_at ON resource_snapshots(synced_at DESC);

ALTER TABLE resource_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select resource_snapshots"
  ON resource_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert resource_snapshots"
  ON resource_snapshots FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update resource_snapshots"
  ON resource_snapshots FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete resource_snapshots"
  ON resource_snapshots FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 2. compliance_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  resource_types text[] NOT NULL DEFAULT '{}',
  condition_type text NOT NULL,
  condition_config jsonb DEFAULT '{}',
  severity text NOT NULL DEFAULT 'warning',
  is_active boolean NOT NULL DEFAULT true,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select compliance_rules"
  ON compliance_rules FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert compliance_rules"
  ON compliance_rules FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update compliance_rules"
  ON compliance_rules FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete compliance_rules"
  ON compliance_rules FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 3. compliance_results
-- ============================================================
CREATE TABLE IF NOT EXISTS compliance_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_applicable',
  detail text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_results_rule_id ON compliance_results(rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_resource_id ON compliance_results(resource_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_account_id ON compliance_results(account_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_status ON compliance_results(status);

ALTER TABLE compliance_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select compliance_results"
  ON compliance_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert compliance_results"
  ON compliance_results FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update compliance_results"
  ON compliance_results FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete compliance_results"
  ON compliance_results FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 4. resource_relationships
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_relationships_account_id ON resource_relationships(account_id);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_source_id ON resource_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_target_id ON resource_relationships(target_id);

ALTER TABLE resource_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select resource_relationships"
  ON resource_relationships FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert resource_relationships"
  ON resource_relationships FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update resource_relationships"
  ON resource_relationships FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete resource_relationships"
  ON resource_relationships FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 5. linode_events
-- ============================================================
CREATE TABLE IF NOT EXISTS linode_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  event_id bigint NOT NULL,
  action text NOT NULL,
  entity_id text,
  entity_type text,
  entity_label text,
  entity_url text,
  secondary_entity_id text,
  secondary_entity_type text,
  secondary_entity_label text,
  message text,
  status text,
  username text,
  duration numeric,
  percent_complete integer,
  seen boolean DEFAULT false,
  event_created timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_linode_events_account_id ON linode_events(account_id);
CREATE INDEX IF NOT EXISTS idx_linode_events_event_created ON linode_events(event_created DESC);
CREATE INDEX IF NOT EXISTS idx_linode_events_entity_type ON linode_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_linode_events_action ON linode_events(action);

ALTER TABLE linode_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select linode_events"
  ON linode_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert linode_events"
  ON linode_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update linode_events"
  ON linode_events FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete linode_events"
  ON linode_events FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- Seed built-in compliance rules
-- ============================================================
INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin)
VALUES
  (
    'Linodes must have a firewall',
    'Every Linode instance should be protected by at least one active firewall.',
    ARRAY['linode'],
    'firewall_attached',
    '{}',
    'critical',
    true
  ),
  (
    'No unrestricted inbound traffic',
    'Firewall rules should not allow unrestricted inbound access (0.0.0.0/0 or ::/0) on sensitive ports.',
    ARRAY['firewall'],
    'no_open_inbound',
    '{"sensitive_ports": [22, 3389, 3306, 5432, 6379, 27017]}',
    'critical',
    true
  ),
  (
    'Firewall must be attached',
    'A firewall that is not attached to any Linode provides no value.',
    ARRAY['firewall'],
    'firewall_has_targets',
    '{}',
    'warning',
    true
  ),
  (
    'LKE clusters should have multiple nodes',
    'Kubernetes clusters should have more than one node for high availability.',
    ARRAY['lke_cluster'],
    'min_node_count',
    '{"min_count": 2}',
    'warning',
    true
  ),
  (
    'Resources should have tags',
    'Resources must have owner, environment, and cost-center tags (format: key:value) for accountability, automation, and cost tracking.',
    ARRAY['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database'],
    'has_tags',
    '{"required_tags": [{"key": "owner", "value": "*"}, {"key": "environment", "value": "*"}, {"key": "cost-center", "value": "*"}]}',
    'info',
    true
  ),
  (
    'Volumes should be attached',
    'Unattached volumes still incur cost but provide no value.',
    ARRAY['volume'],
    'volume_attached',
    '{}',
    'warning',
    true
  )
ON CONFLICT DO NOTHING;
