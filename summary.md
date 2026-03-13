# Linode Cloud Compliance & Security Platform -- Implementation Summary

This document describes the compliance and security features of a Linode infrastructure management platform. It is intended to be used as a specification for reimplementation against a standalone PostgreSQL database (no Supabase dependency).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Authentication & RBAC](#authentication--rbac)
4. [Resource Sync Engine](#resource-sync-engine)
5. [Compliance Rule System](#compliance-rule-system)
6. [Built-in Compliance Rules (29 Rules)](#built-in-compliance-rules-29-rules)
7. [Compliance Profiles (6 Profiles)](#compliance-profiles-6-profiles)
8. [Compliance Evaluation Engine](#compliance-evaluation-engine)
9. [Composite Rules](#composite-rules)
10. [Compliance Score Calculation](#compliance-score-calculation)
11. [Acknowledgment Workflow](#acknowledgment-workflow)
12. [Compliance Result Notes](#compliance-result-notes)
13. [Per-Account Rule Overrides](#per-account-rule-overrides)
14. [Resource Relationships](#resource-relationships)
15. [Config Change History (Snapshots)](#config-change-history-snapshots)
16. [Event Timeline](#event-timeline)
17. [Compliance Reporting](#compliance-reporting)
18. [Frontend UI Features](#frontend-ui-features)
19. [API Endpoints](#api-endpoints)

---

## Architecture Overview

The system is a three-tier application:

- **Frontend**: React + TypeScript + Tailwind CSS SPA
- **Backend**: Express.js (Node/TypeScript) server that syncs resources from the Linode API, evaluates compliance rules, and stores results
- **Database**: PostgreSQL (originally via Supabase, but the schema is plain PostgreSQL with RLS)

The flow is:
1. Admin adds a Linode account (stores API token)
2. System syncs all infrastructure resources from the Linode API
3. Compliance rules are evaluated against all resources
4. Results are stored with scores, history, and per-resource breakdowns
5. Users view results, acknowledge findings, add notes, and generate reports

---

## Database Schema

### `linode_accounts`

Stores Linode API account credentials and sync metadata.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `name` | text | | NOT NULL |
| `api_token` | text | | NOT NULL |
| `webhook_api_key` | text | | nullable |
| `last_sync_at` | timestamptz | | nullable |
| `last_evaluated_at` | timestamptz | | nullable |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### `resources`

All infrastructure resources discovered from Linode accounts.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `resource_id` | text | | NOT NULL |
| `resource_type` | text | | NOT NULL |
| `label` | text | | nullable |
| `region` | text | | nullable |
| `status` | text | | nullable |
| `specs` | jsonb | | nullable |
| `pricing` | jsonb | | nullable |
| `plan_type` | text | | nullable |
| `monthly_cost` | numeric | `0` | |
| `resource_created_at` | timestamptz | | nullable |
| `last_synced_at` | timestamptz | | nullable |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Indexes:** `idx_resources_account_id` on `account_id`

**Resource types:** `linode`, `volume`, `nodebalancer`, `lke_cluster`, `object_storage`, `database`, `firewall`, `vpc`

### `compliance_rules`

Defines compliance check rules. Both built-in (global) and custom (per-account) rules are stored here.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | nullable, FK -> linode_accounts(id) ON DELETE CASCADE |
| `name` | text | | NOT NULL |
| `description` | text | `''` | NOT NULL |
| `resource_types` | text[] | `'{}'` | NOT NULL |
| `condition_type` | text | | NOT NULL |
| `condition_config` | jsonb | `'{}'` | |
| `severity` | text | `'warning'` | NOT NULL |
| `is_active` | boolean | `true` | NOT NULL |
| `is_builtin` | boolean | `false` | NOT NULL |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Notes:**
- `account_id = NULL` means a global/built-in rule
- `account_id = <some uuid>` means an account-specific custom rule
- `condition_type` determines the evaluation logic
- `condition_config` holds type-specific configuration as JSON

**Indexes:** `idx_compliance_rules_account_id` on `account_id`

### `compliance_profiles`

Named collections of compliance rules, organized by framework (CIS, SOC 2, PCI-DSS, etc.).

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `name` | text | | NOT NULL |
| `slug` | text | | UNIQUE, NOT NULL |
| `description` | text | | nullable |
| `tier` | text | | nullable |
| `is_builtin` | boolean | `false` | |
| `version` | text | | nullable |
| `icon` | text | | nullable |
| `rule_condition_types` | text[] | `'{}'` | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Notes:**
- Profiles reference rules by their `condition_type` values in the `rule_condition_types` array
- `tier` values: `foundation`, `standard`, `strict`
- `icon` stores a Lucide icon name for the UI

### `account_compliance_profiles`

Junction table linking accounts to activated compliance profiles.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `profile_id` | uuid | | NOT NULL, FK -> compliance_profiles(id) ON DELETE CASCADE |
| `activated_at` | timestamptz | `now()` | |
| `created_at` | timestamptz | `now()` | |

### `compliance_results`

Stores the outcome of each rule evaluation against each resource.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `rule_id` | uuid | | NOT NULL, FK -> compliance_rules(id) ON DELETE CASCADE |
| `resource_id` | uuid | | nullable, FK -> resources(id) ON DELETE CASCADE |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `status` | text | `'not_applicable'` | NOT NULL |
| `detail` | text | | nullable |
| `acknowledged` | boolean | `false` | NOT NULL |
| `acknowledged_at` | timestamptz | | nullable |
| `acknowledged_note` | text | | nullable |
| `acknowledged_by` | uuid | | nullable, FK -> org_users(id) ON DELETE SET NULL |
| `evaluated_at` | timestamptz | `now()` | NOT NULL |
| `created_at` | timestamptz | `now()` | |

**Notes:**
- `resource_id` is nullable for account-level rules (e.g., `tfa_users`, `login_allowed_ips`)
- `status` values: `compliant`, `non_compliant`, `not_applicable`
- The `acknowledged_by` field references `org_users` for audit trail

**Indexes:** `idx_compliance_results_account_id`, `idx_cr_resource_id`, `idx_cr_rule_id`

### `compliance_score_history`

Historical compliance scores computed after each evaluation run.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `evaluated_at` | timestamptz | `now()` | NOT NULL |
| `total_results` | integer | `0` | NOT NULL |
| `compliant_count` | integer | `0` | NOT NULL |
| `non_compliant_count` | integer | `0` | NOT NULL |
| `not_applicable_count` | integer | `0` | NOT NULL |
| `acknowledged_count` | integer | `0` | NOT NULL |
| `compliance_score` | numeric(5,2) | | nullable |
| `total_rules_evaluated` | integer | `0` | NOT NULL |
| `rule_breakdown` | jsonb | `'[]'::jsonb` | |
| `created_at` | timestamptz | `now()` | |

**Notes:**
- `rule_breakdown` is a JSON array of objects: `{ rule_id, rule_name, severity, compliant, non_compliant, not_applicable }`
- `compliance_score` is a percentage (0.00 to 100.00), null if no scoreable results

**Indexes:** `idx_compliance_score_history_account_evaluated` on `(account_id, evaluated_at DESC)`

### `resource_compliance_history`

Per-resource compliance snapshots over time.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `resource_id` | uuid | | NOT NULL, FK -> resources(id) ON DELETE CASCADE |
| `evaluated_at` | timestamptz | `now()` | NOT NULL |
| `results` | jsonb | `'[]'::jsonb` | NOT NULL |
| `created_at` | timestamptz | `now()` | NOT NULL |

**Notes:**
- `results` is a JSON array: `[{ rule_id, rule_name, severity, status, detail, acknowledged }]`

**Indexes:** `idx_rch_account_id`, `idx_rch_resource_id`

### `compliance_result_notes`

User-added notes/comments on individual compliance results.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `compliance_result_id` | uuid | | NOT NULL, FK -> compliance_results(id) ON DELETE CASCADE |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `note` | text | | NOT NULL |
| `created_by` | uuid | | nullable, FK -> org_users(id) ON DELETE SET NULL |
| `created_at` | timestamptz | `now()` | NOT NULL |

**Indexes:** `idx_compliance_result_notes_account_id`, `idx_crn_compliance_result_id`

### `account_rule_overrides`

Per-account overrides to enable/disable specific compliance rules.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `rule_id` | uuid | | NOT NULL, FK -> compliance_rules(id) ON DELETE CASCADE |
| `is_active` | boolean | `true` | NOT NULL |
| `applied_by_profile_id` | uuid | | nullable, FK -> compliance_profiles(id) ON DELETE SET NULL |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Unique constraint:** `(account_id, rule_id)`

### `resource_snapshots` (Config Change History)

Point-in-time snapshots of resource configurations with diffs.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `resource_id` | uuid | | NOT NULL, FK -> resources(id) ON DELETE CASCADE |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `resource_type` | text | | NOT NULL |
| `label` | text | | NOT NULL |
| `region` | text | | nullable |
| `plan_type` | text | | nullable |
| `monthly_cost` | numeric | `0` | |
| `status` | text | | nullable |
| `specs` | jsonb | | nullable |
| `diff` | jsonb | | nullable |
| `synced_at` | timestamptz | `now()` | NOT NULL |
| `created_at` | timestamptz | `now()` | |

**Notes:**
- `diff` is a JSON object of `{ field_name: { from: old_value, to: new_value } }` pairs
- Only created when a change is detected between syncs

**Indexes:** `idx_resource_snapshots_resource_id`, `idx_resource_snapshots_account_id`, `idx_resource_snapshots_synced_at`

### `resource_relationships`

Tracks relationships between infrastructure resources.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `source_id` | uuid | | NOT NULL, FK -> resources(id) ON DELETE CASCADE |
| `target_id` | uuid | | NOT NULL, FK -> resources(id) ON DELETE CASCADE |
| `relationship_type` | text | | NOT NULL |
| `metadata` | jsonb | | nullable |
| `synced_at` | timestamptz | `now()` | NOT NULL |
| `created_at` | timestamptz | `now()` | |

**Relationship types:**
- `protects` -- firewall -> linode
- `attached_to` -- volume -> linode
- `contains` -- vpc -> linode, vpc -> database

**Indexes:** `idx_resource_relationships_account_id`, `idx_resource_relationships_source_id`, `idx_resource_relationships_target_id`

### `linode_events`

Ingested Linode API events for the activity timeline.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `event_id` | bigint | | NOT NULL |
| `action` | text | | NOT NULL |
| `entity_id` | text | | nullable |
| `entity_type` | text | | nullable |
| `entity_label` | text | | nullable |
| `entity_url` | text | | nullable |
| `secondary_entity_id` | text | | nullable |
| `secondary_entity_type` | text | | nullable |
| `secondary_entity_label` | text | | nullable |
| `message` | text | | nullable |
| `status` | text | | nullable |
| `username` | text | | nullable |
| `duration` | numeric | | nullable |
| `percent_complete` | integer | | nullable |
| `seen` | boolean | `false` | |
| `event_created` | timestamptz | | nullable |
| `created_at` | timestamptz | `now()` | |

**Unique constraint:** `(account_id, event_id)`

**Indexes:** `idx_linode_events_account_id`, `idx_linode_events_event_created`

### `org_users`

Application users with role-based access.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | | PRIMARY KEY |
| `email` | text | | NOT NULL, UNIQUE |
| `full_name` | text | `''` | NOT NULL |
| `role` | text | `'auditor'` | NOT NULL, CHECK (role IN ('admin', 'power_user', 'auditor')) |
| `is_active` | boolean | `true` | NOT NULL |
| `can_view_costs` | boolean | `true` | NOT NULL |
| `can_view_compliance` | boolean | `true` | NOT NULL |
| `created_at` | timestamptz | `now()` | NOT NULL |
| `updated_at` | timestamptz | `now()` | NOT NULL |

### `user_account_access`

Grants users access to specific Linode accounts.

| Column | Type | Default | Constraints |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | uuid | | NOT NULL, FK -> org_users(id) ON DELETE CASCADE |
| `account_id` | uuid | | NOT NULL, FK -> linode_accounts(id) ON DELETE CASCADE |
| `granted_by` | uuid | | nullable, FK -> org_users(id) |
| `granted_at` | timestamptz | `now()` | NOT NULL |
| `can_view_costs` | boolean | `true` | NOT NULL |
| `can_view_compliance` | boolean | `true` | NOT NULL |

**Unique constraint:** `(user_id, account_id)`

---

## Authentication & RBAC

### Roles

| Role | Description |
|---|---|
| `admin` | Full access. Can manage users, accounts, rules, profiles. Can view all accounts. |
| `power_user` | Can manage accounts and trigger syncs. Can view compliance. Cannot manage users or global rules. |
| `auditor` | Read-only. Can only view accounts they have been granted access to. |

### Feature Flags

Two levels of feature gating:

1. **Global (org_users):** `can_view_costs`, `can_view_compliance` -- applies across all accounts
2. **Per-account (user_account_access):** `can_view_costs`, `can_view_compliance` -- per-account override

Both flags must be true for a user to see the relevant data for a specific account.

### Access Control Pattern

All account-scoped tables use this access pattern:
- Admins can access all data
- Non-admin users can only access data for accounts they have been granted access to via `user_account_access`

### Registration Flow

- `registration_open()` returns true if zero org_users exist (open registration for first user)
- First user is automatically promoted to `admin` role
- Subsequent users require admin invitation

---

## Resource Sync Engine

The sync process fetches all resources from the Linode API and stores them in the `resources` table. It also:

1. Creates `resource_snapshots` with diffs when resource configurations change
2. Builds `resource_relationships` (firewall->linode, volume->linode, vpc->linode/database)
3. Ingests `linode_events` for the activity timeline

### Linode API Endpoints Used

| Endpoint | Resource Type |
|---|---|
| `GET /v4/linode/instances` | `linode` |
| `GET /v4/linode/instances/{id}/firewalls` | (firewall attachments) |
| `GET /v4/volumes` | `volume` |
| `GET /v4/nodebalancers` | `nodebalancer` |
| `GET /v4/nodebalancers/{id}/configs` | (port configurations) |
| `GET /v4/nodebalancers/{id}/configs/{cid}/nodes` | (backend nodes) |
| `GET /v4/nodebalancers/{id}/vpcs` | (VPC associations) |
| `GET /v4/lke/clusters` | `lke_cluster` |
| `GET /v4/lke/clusters/{id}/pools` | (node pools) |
| `GET /v4/object-storage/buckets` | `object_storage` (paginated) |
| `GET /v4/object-storage/buckets/{region}/{label}/access` | (ACL + CORS) |
| `GET /v4/databases/instances` | `database` |
| `GET /v4/databases/{engine}/instances/{id}` | (VPC/access details) |
| `GET /v4/networking/firewalls` | `firewall` |
| `GET /v4/vpcs` | `vpc` |
| `GET /v4/account/events` | (activity events) |

### Resource `specs` JSONB Structure Per Type

**`linode`:**
```json
{
  "vcpus": 2,
  "memory": 4096,
  "disk": 81920,
  "transfer": 4000,
  "gpus": 0,
  "tags": ["owner:team-a", "environment:prod"],
  "attached_firewalls": [{ "id": 123, "label": "my-fw", "status": "enabled" }],
  "backups_enabled": true,
  "backups_available": true,
  "backups_last_successful": "2026-03-12T00:00:00Z",
  "disk_encryption": "enabled",
  "locks": ["delete"],
  "status": "running"
}
```

**`volume`:**
```json
{
  "size": 20,
  "tags": [],
  "linode_id": 12345,
  "linode_label": "my-linode",
  "filesystem_path": "/dev/disk/by-id/scsi-0...",
  "encryption": "enabled"
}
```

**`nodebalancer`:**
```json
{
  "ipv4": "192.0.2.1",
  "tags": [],
  "node_count": 3,
  "nodes": [{ "id": 1, "label": "backend-1", "address": "...", "status": "UP" }],
  "configs": [{ "id": 1, "port": 443, "protocol": "https", "algorithm": "roundrobin" }],
  "vpcs": [{ "vpc_id": 1, "subnet_id": 2, "ipv4_range": null }]
}
```

**`lke_cluster`:**
```json
{
  "k8s_version": "1.29",
  "node_count": 3,
  "pool_count": 1,
  "high_availability": true,
  "audit_logs_enabled": true,
  "tags": [],
  "pools": [{ "id": 1, "type": "g6-standard-2", "count": 3, "autoscaler": null }]
}
```

**`object_storage`:**
```json
{
  "hostname": "bucket.us-east-1.linodeobjects.com",
  "endpoint_type": "E1",
  "objects": 150,
  "size": 2.5,
  "s3_endpoint": "us-east-1.linodeobjects.com",
  "acl": "private",
  "cors_enabled": false
}
```

**`database`:**
```json
{
  "engine": "mysql",
  "version": "8.0.30",
  "cluster_size": 3,
  "encrypted": true,
  "port": 3306,
  "tags": [],
  "vpc_id": null,
  "subnet_id": null,
  "public_access": false,
  "allow_list": ["10.0.0.0/8"]
}
```

**`firewall`:**
```json
{
  "inbound_policy": "DROP",
  "outbound_policy": "ACCEPT",
  "inbound_rules": 5,
  "outbound_rules": 2,
  "inbound_rules_detail": [
    {
      "action": "ACCEPT",
      "protocol": "TCP",
      "ports": "443",
      "label": "Allow HTTPS",
      "description": "Allow inbound HTTPS traffic",
      "addresses": {
        "ipv4": ["0.0.0.0/0"],
        "ipv6": ["::/0"]
      }
    }
  ],
  "outbound_rules_detail": [],
  "entity_count": 2,
  "entities": [{ "id": 123, "label": "my-linode", "via_interface": false }],
  "tags": []
}
```

**`vpc`:**
```json
{
  "description": "Production VPC",
  "subnet_count": 2,
  "subnets": [{ "id": 1, "label": "subnet-a", "ipv4": "10.0.0.0/24", "linode_count": 3 }],
  "linode_count": 5,
  "linode_ids": [123, 456, 789]
}
```

---

## Compliance Rule System

### Rule Anatomy

Each compliance rule has:
- **condition_type**: Identifies the evaluation logic to use (e.g., `firewall_attached`, `no_open_inbound`)
- **condition_config**: JSON object with type-specific parameters
- **resource_types**: Array of resource types this rule applies to (empty = account-level rule)
- **severity**: `critical`, `warning`, or `info`
- **is_builtin**: Whether this is a system-provided rule
- **is_active**: Whether the rule should be evaluated

### Rule Categories

1. **Account-level rules**: No resource_types. Evaluate against the Linode account API directly. Produce results with `resource_id = NULL`.
2. **Resource-level rules**: Have resource_types. Evaluate against each matching resource. One result per (rule, resource) pair.
3. **Composite rules**: Meta-rules that combine results from other rules using logical operators.

---

## Built-in Compliance Rules (29 Rules)

### 1. Linodes Must Have a Firewall
- **condition_type:** `firewall_attached`
- **severity:** critical
- **resource_types:** `['linode']`
- **condition_config:** `{}`
- **description:** Every Linode instance should be protected by at least one active firewall.
- **Logic:** Checks `resource.specs.attached_firewalls` AND cross-references firewall resources whose `specs.entities` array contains the Linode's `resource_id`. If any firewalls found: compliant. Otherwise: non_compliant.

### 2. No Unrestricted Inbound Traffic
- **condition_type:** `no_open_inbound`
- **severity:** critical
- **resource_types:** `['firewall']`
- **condition_config:** `{"sensitive_ports": [22, 3389, 3306, 5432, 6379, 27017]}`
- **description:** Firewall rules should not allow unrestricted inbound access (0.0.0.0/0 or ::/0) on sensitive ports.
- **Logic:** Iterates `specs.inbound_rules_detail`. For each ACCEPT rule with protocol TCP or ALL: checks if source addresses include `0.0.0.0/0`, `::/0`, or `2000::/3`. If open, checks if any sensitive port is matched (handles port ranges like `"80-443"` and comma-separated lists). Also flags if `inbound_policy === 'ACCEPT'` with no rules (all traffic allowed).

### 3. Firewall Must Be Attached
- **condition_type:** `firewall_has_targets`
- **severity:** info
- **resource_types:** `['firewall']`
- **condition_config:** `{}`
- **description:** A firewall that is not attached to any Linode provides no value.
- **Logic:** Checks `specs.entity_count > 0`.

### 4. LKE Clusters Should Have Multiple Nodes
- **condition_type:** `min_node_count`
- **severity:** warning
- **resource_types:** `['lke_cluster']`
- **condition_config:** `{"min_count": 2}`
- **description:** Kubernetes clusters should have more than one node for high availability.
- **Logic:** Reads `specs.node_count` or `specs.nodes.length`. Compares against `min_count`.

### 5. Resources Should Have Tags
- **condition_type:** `has_tags`
- **severity:** info
- **resource_types:** `['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database']`
- **condition_config:** `{"required_tags": [{"key": "owner", "value": "*"}, {"key": "environment", "value": "*"}, {"key": "cost-center", "value": "*"}]}`
- **description:** Resources must have owner, environment, and cost-center tags for accountability.
- **Logic:** For each required tag, searches `specs.tags` for a matching tag (case-insensitive). Tags can be plain strings matching the key, or `key:value` format. If `value` is set and not `*`, validates the value portion. Missing or wrong-value tags produce non_compliant. If no `required_tags`, falls back to `min_tags` check (default 1).

### 6. Volumes Should Be Attached
- **condition_type:** `volume_attached`
- **severity:** info
- **resource_types:** `['volume']`
- **condition_config:** `{}`
- **description:** Unattached volumes still incur cost but provide no value.
- **Logic:** Checks `specs.linode_id` is truthy.

### 7. No Unrestricted Database Access
- **condition_type:** `db_allowlist_check`
- **severity:** critical
- **resource_types:** `['database']`
- **condition_config:** `{"forbidden_cidrs": ["0.0.0.0/0", "::/0"], "require_non_empty": false}`
- **description:** Managed databases should not have 0.0.0.0/0 or ::/0 in their IP allow list.
- **Logic:** Reads `specs.allow_list`. If undefined: not_applicable. If `require_non_empty` and list is empty: violation. If any CIDR matches `forbidden_cidrs`: violation.

### 8. Databases Must Not Have Public Access Enabled
- **condition_type:** `db_public_access`
- **severity:** critical
- **resource_types:** `['database']`
- **condition_config:** `{"allow_public_access": false}`
- **description:** Managed databases with public_access enabled are reachable from outside the VPC.
- **Logic:** Reads `specs.public_access`. If null: not_applicable. If true and config disallows: non_compliant.

### 9. Linode Backups Enabled
- **condition_type:** `linode_backups_enabled`
- **severity:** critical
- **resource_types:** `['linode']`
- **condition_config:** `{}`
- **description:** Verifies that automated backups are enabled for every Linode instance.
- **Logic:** Reads `specs.backups_enabled`. null -> not_applicable. true -> compliant. false -> non_compliant.

### 10. Linode Disk Encryption Enabled
- **condition_type:** `linode_disk_encryption`
- **severity:** critical
- **resource_types:** `['linode']`
- **condition_config:** `{}`
- **description:** Verifies that disk encryption is enabled on every Linode instance.
- **Logic:** Reads `specs.disk_encryption`. null -> not_applicable. `'enabled'` -> compliant. Otherwise -> non_compliant.

### 11. Linode Deletion Lock Configured
- **condition_type:** `linode_lock_configured`
- **severity:** warning
- **resource_types:** `['linode']`
- **condition_config:** `{"required_lock_types": []}`
- **description:** Verifies that at least one deletion lock is configured.
- **Logic:** Reads `specs.locks`. Empty array -> non_compliant. If `required_lock_types` specified, checks all are present. Otherwise any lock -> compliant.

### 12. Linode Instance Not Offline
- **condition_type:** `linode_not_offline`
- **severity:** warning
- **resource_types:** `['linode']`
- **condition_config:** `{}`
- **description:** Flags any Linode instance in an offline state.
- **Logic:** Reads `specs.status`. `'offline'` -> non_compliant. Otherwise -> compliant.

### 13. Linode Backup Recency
- **condition_type:** `linode_backup_recency`
- **severity:** warning
- **resource_types:** `['linode']`
- **condition_config:** `{"max_age_days": 7}`
- **description:** Verifies that a successful backup has occurred within the configured number of days.
- **Logic:** Checks `specs.backups_enabled` (non_compliant if false). Then checks `specs.backups_last_successful`. Computes age in days. If `ageDays <= max_age_days`: compliant.

### 14. LKE Control Plane ACL Configured
- **condition_type:** `lke_control_plane_acl`
- **severity:** critical
- **resource_types:** `['lke_cluster']`
- **condition_config:** `{}`
- **description:** Verifies the LKE cluster control plane has an ACL enabled and does not allow unrestricted access.
- **Logic:** Makes a LIVE API call to `GET /v4/lke/clusters/{resource_id}/control_plane_acl`. HTTP 400 -> not_applicable (unsupported). If `acl.enabled === false`: non_compliant. If enabled but addresses contain `0.0.0.0/0` or `::/0`: non_compliant. Otherwise: compliant.

### 15. Volume Encryption Enabled
- **condition_type:** `volume_encryption_enabled`
- **severity:** critical
- **resource_types:** `['volume']`
- **condition_config:** `{}`
- **description:** Block storage volumes must have disk encryption enabled.
- **Logic:** Reads `specs.encryption`. null -> not_applicable. `'enabled'` -> compliant. Otherwise -> non_compliant.

### 16. LKE Control Plane High Availability
- **condition_type:** `lke_control_plane_ha`
- **severity:** warning
- **resource_types:** `['lke_cluster']`
- **condition_config:** `{}`
- **description:** LKE cluster control plane HA must be enabled for production resilience.
- **Logic:** Reads `specs.high_availability`. true -> compliant. false -> non_compliant.

### 17. LKE Audit Logs Enabled
- **condition_type:** `lke_audit_logs_enabled`
- **severity:** warning
- **resource_types:** `['lke_cluster']`
- **condition_config:** `{}`
- **description:** LKE control plane audit logging must be enabled.
- **Logic:** Reads `specs.audit_logs_enabled`. null -> not_applicable. true -> compliant. false -> non_compliant.

### 18. Object Storage Bucket ACL
- **condition_type:** `bucket_acl_check`
- **severity:** critical
- **resource_types:** `['object_storage']`
- **condition_config:** `{"required_acl": "", "forbidden_acls": ["public-read", "public-read-write", "authenticated-read"]}`
- **description:** Object storage bucket ACL must not allow public access.
- **Logic:** Reads `specs.acl`. null -> not_applicable. If `required_acl` set and ACL doesn't match: non_compliant. If ACL is in `forbidden_acls`: non_compliant.

### 19. All Users Must Have TFA Enabled
- **condition_type:** `tfa_users`
- **severity:** critical
- **resource_types:** `[]` (account-level)
- **condition_config:** `{}`
- **description:** Every user on the account must have two-factor authentication enabled.
- **Logic:** LIVE API call to `GET /v4/account/users`. Filters out proxy/service users (configurable via `exclude_user_types`, default `['proxy']`). For each remaining user, checks `tfa_enabled`. One result per user.

### 20. Account Login IP Restriction
- **condition_type:** `login_allowed_ips`
- **severity:** warning
- **resource_types:** `[]` (account-level)
- **condition_config:** `{}`
- **description:** Account logins must only be permitted from a configured IP allow list.
- **Logic:** LIVE API call to `GET /v4/account/logins`. Requires `condition_config.allowed_ips` to be set (array of IP strings). If empty: not_applicable. For each login entry, checks if `login.ip` is in the allowed list. One result per login.

### 21. Resources in Approved Regions
- **condition_type:** `approved_regions`
- **severity:** warning
- **resource_types:** `['linode', 'volume', 'lke_cluster', 'database', 'nodebalancer', 'object_storage']`
- **condition_config:** `{"approved_regions": []}`
- **description:** All resources must be deployed only in approved geographic regions.
- **Logic:** If no `approved_regions` configured: not_applicable. If resource has no region: not_applicable. Checks if `resource.region` is in the list.

### 22. Firewall Policy Requirements
- **condition_type:** `firewall_rules_check`
- **severity:** warning
- **resource_types:** `['linode']`
- **condition_config:** `{"required_inbound_policy": "DROP", "required_outbound_policy": "", "blocked_ports": [], "allowed_source_ips": [], "require_no_open_ports": false}`
- **description:** Firewall inbound and outbound policies must meet configurable security requirements.
- **Logic:** Finds all firewalls attached to the Linode (dual-source: specs.attached_firewalls + firewall resources' specs.entities). No firewall -> non_compliant. Then checks: inbound/outbound policy matches, blocked ports aren't accessible, no unrestricted access if `require_no_open_ports`, and source IPs match `allowed_source_ips`.

### 23. NodeBalancer Protocol Check
- **condition_type:** `nodebalancer_protocol_check`
- **severity:** warning
- **resource_types:** `['nodebalancer']`
- **condition_config:** `{"allowed_protocols": ["https"]}`
- **description:** NodeBalancer ports must use only HTTPS protocol.
- **Logic:** Reads `specs.configs`. For each config, checks if `protocol` is in `allowed_protocols`. Also supports `forbidden_protocols`.

### 24. NodeBalancer Allowed Ports
- **condition_type:** `nodebalancer_port_allowlist`
- **severity:** warning
- **resource_types:** `['nodebalancer']`
- **condition_config:** `{"allowed_ports": [443]}`
- **description:** NodeBalancer must only listen on approved ports.
- **Logic:** Reads `specs.configs`. Checks each `cfg.port` against `allowed_ports`.

### 25. Firewall Rules Must Not Allow All Ports
- **condition_type:** `firewall_all_ports_allowed`
- **severity:** warning
- **resource_types:** `['firewall']`
- **condition_config:** `{"check_inbound": true, "check_outbound": false, "actions": ["ACCEPT"]}`
- **description:** Detects firewall rules that allow traffic on all ports.
- **Logic:** A rule is "all ports" if: `protocol === 'ALL'`, or ports is empty, or ports is `'1-65535'`. Skips ICMP and IPENCAP protocols. Only checks rules whose action matches `actions` config.

### 26. Firewall Rules Must Have Descriptions
- **condition_type:** `firewall_rule_descriptions`
- **severity:** warning
- **resource_types:** `['firewall']`
- **condition_config:** `{}`
- **description:** All inbound and outbound firewall rules must have a non-empty description.
- **Logic:** Combines inbound and outbound rules. Checks each for empty/missing `description` field.

### 27. Object Storage Bucket CORS
- **condition_type:** `bucket_cors_check`
- **severity:** info
- **resource_types:** `['object_storage']`
- **condition_config:** `{"require_cors_disabled": false, "require_cors_enabled": false}`
- **description:** Checks whether CORS is enabled or disabled on object storage buckets.
- **Logic:** Reads `specs.cors_enabled`. null -> not_applicable. If `require_cors_disabled` and CORS enabled: non_compliant. If `require_cors_enabled` and CORS disabled: non_compliant.

### 28. No RFC-1918 Lateral Movement via Firewall
- **condition_type:** `firewall_rfc1918_lateral`
- **severity:** warning
- **resource_types:** `['firewall']`
- **condition_config:** `{"sensitive_ports": [22, 3389, 3306, 5432, 5984, 6379, 9200, 27017]}`
- **description:** Detects inbound firewall rules that allow sensitive port traffic from RFC-1918 private IP ranges.
- **Logic:** For each ACCEPT inbound rule (TCP or ALL): filters IPv4 addresses for RFC-1918 ranges (10.x, 172.16-31.x, 192.168.x using prefix matching). If private sources exist, checks if any sensitive port is matched.

### 29. No Duplicate Firewall Rules
- **condition_type:** `firewall_no_duplicate_rules`
- **severity:** info
- **resource_types:** `['firewall']`
- **condition_config:** `{}`
- **description:** Detects duplicate firewall rules in the same direction.
- **Logic:** Creates a fingerprint per rule: `"ACTION|PROTOCOL|PORTS|sorted_ipv4|sorted_ipv6"`. Checks inbound and outbound sets separately for duplicates.

### Additional Condition Types (supported but not seeded as built-in rules)

- **`linode_plan_tier_by_tag`**: Checks that Linodes with a specific tag use approved plan tiers. Config: `tag`, `tag_value`, `approved_tiers`. Extracts tier from `plan_type` by stripping `g{N}-` prefix and trailing `-{N}` suffix.

---

## Compliance Profiles (6 Profiles)

Profiles are named collections of rules identified by `condition_type`. When a profile is activated for an account, the corresponding rules are enabled via `account_rule_overrides`.

### Profile 1: Level 1 -- Foundation (`cis-l1`)
- **Tier:** foundation
- **Icon:** shield
- **Description:** Foundational, low-friction controls that every cloud account should satisfy.
- **Rules (9):** `firewall_attached`, `no_open_inbound`, `linode_backups_enabled`, `db_allowlist_check`, `db_public_access`, `tfa_users`, `has_tags`, `volume_attached`, `lke_control_plane_acl`

### Profile 2: Level 2 -- Standard (`cis-l2`)
- **Tier:** standard
- **Icon:** shield-check
- **Description:** Deeper technical controls for production workloads requiring defense in depth.
- **Rules (20):** `firewall_attached`, `firewall_rules_check`, `firewall_has_targets`, `no_open_inbound`, `linode_backups_enabled`, `linode_backup_recency`, `linode_disk_encryption`, `linode_lock_configured`, `volume_encryption_enabled`, `db_allowlist_check`, `db_public_access`, `tfa_users`, `login_allowed_ips`, `has_tags`, `approved_regions`, `min_node_count`, `lke_control_plane_ha`, `lke_control_plane_acl`, `lke_audit_logs_enabled`, `bucket_acl_check`

### Profile 3: SOC 2 Readiness (`soc2`)
- **Tier:** standard
- **Icon:** file-check
- **Description:** Maps controls to SOC 2 Trust Service Criteria (Security CC6/CC7, Availability A1, Confidentiality C1).
- **Rules (15):** `firewall_attached`, `no_open_inbound`, `linode_backups_enabled`, `linode_backup_recency`, `linode_disk_encryption`, `linode_lock_configured`, `volume_encryption_enabled`, `db_allowlist_check`, `db_public_access`, `tfa_users`, `login_allowed_ips`, `lke_audit_logs_enabled`, `lke_control_plane_acl`, `bucket_acl_check`, `has_tags`

### Profile 4: PCI-DSS Baseline (`pci-dss`)
- **Tier:** strict
- **Icon:** credit-card
- **Description:** Controls aligned to PCI DSS v4.0 Requirements 1, 2, 3, 7, and 10.
- **Rules (19):** `firewall_attached`, `firewall_rules_check`, `no_open_inbound`, `linode_backups_enabled`, `linode_backup_recency`, `linode_disk_encryption`, `linode_lock_configured`, `volume_encryption_enabled`, `db_allowlist_check`, `db_public_access`, `tfa_users`, `login_allowed_ips`, `approved_regions`, `lke_control_plane_ha`, `lke_control_plane_acl`, `lke_audit_logs_enabled`, `bucket_acl_check`, `nodebalancer_protocol_check`, `nodebalancer_port_allowlist`

### Profile 5: Minimal / Dev (`minimal-dev`)
- **Tier:** foundation
- **Icon:** wrench
- **Description:** Lightweight profile for development/staging. Only critical blocking issues are flagged.
- **Rules (5):** `firewall_attached`, `no_open_inbound`, `db_allowlist_check`, `db_public_access`, `tfa_users`

### Profile 6: All Rules (`all-rules`)
- **Tier:** strict
- **Icon:** shield-check
- **Description:** Enables every available compliance rule for full visibility.
- **Rules (29):** All condition types listed above.

---

## Compliance Evaluation Engine

### Trigger

Evaluation is triggered via the `POST /api/refresh` endpoint (or `GET /api/refresh` for cron). It can optionally skip sync or evaluation.

### Evaluation Flow

1. Fetch all resources for the account from `resources` table
2. Fetch all active compliance rules (global where `account_id IS NULL` + account-specific)
3. Fetch the account's API token (needed for live Linode API calls)
4. Load existing acknowledgment state from current `compliance_results`
5. Delete all existing compliance results for the account (full replacement)
6. For each non-composite rule:
   - If account-level (empty resource_types): call Linode API directly, produce results with `resource_id = null`
   - If resource-level: filter resources by `resource_types`, evaluate each resource, produce one result per (rule, resource)
7. For each composite rule: combine results from sub-rules using logical operators
8. Restore acknowledgment flags from the saved state (matching by `rule_id:resource_id` key)
9. Insert all results into `compliance_results`
10. Update `linode_accounts.last_evaluated_at`
11. Compute compliance score and insert into `compliance_score_history`
12. Insert per-resource compliance history into `resource_compliance_history`

### Result Statuses

| Status | Meaning |
|---|---|
| `compliant` | Resource/account passes the check |
| `non_compliant` | Resource/account fails the check |
| `not_applicable` | Cannot be evaluated (missing data, unsupported feature, no API token, etc.) |

---

## Composite Rules

Composite rules combine the results of other rules using logical operators. They have `condition_type = 'composite'` and use `condition_config` to define the logic.

### Operators

**AND** (`condition_config.operator = 'AND'`):
- `condition_config.rule_ids`: array of sub-rule UUIDs
- Groups results by `resource_id`
- All sub-rules compliant -> compliant
- Any sub-rule non_compliant -> non_compliant
- Otherwise -> not_applicable

**OR** (`condition_config.operator = 'OR'`):
- `condition_config.rule_ids`: array of sub-rule UUIDs
- Any sub-rule compliant -> compliant
- All not_applicable -> not_applicable
- Otherwise -> non_compliant

**NOT** (`condition_config.operator = 'NOT'`):
- `condition_config.rule_ids[0]`: single sub-rule UUID
- Inverts: compliant -> non_compliant, non_compliant -> compliant, other -> not_applicable

**IF_THEN** (`condition_config.operator = 'IF_THEN'`):
- `condition_config.if_rule_id`: the "condition" rule UUID
- `condition_config.then_rule_id`: the "requirement" rule UUID
- If the IF-rule is not non_compliant -> not_applicable
- If the IF-rule IS non_compliant AND THEN-rule is compliant -> compliant
- If the IF-rule IS non_compliant AND THEN-rule is not compliant -> non_compliant

---

## Compliance Score Calculation

Scores are computed from **unacknowledged** results only:

```
scoreable = compliant_count + non_compliant_count  (excludes not_applicable)
compliance_score = (compliant_count / scoreable) * 100  (rounded to 2 decimal places)
```

- `not_applicable` results are excluded from the denominator
- Acknowledged results are excluded entirely
- If zero scoreable results, score is `null`

A per-rule breakdown is also stored:
```json
[
  {
    "rule_id": "uuid",
    "rule_name": "Linodes Must Have a Firewall",
    "severity": "critical",
    "compliant": 8,
    "non_compliant": 2,
    "not_applicable": 0
  }
]
```

---

## Acknowledgment Workflow

Users can acknowledge compliance findings to suppress them from score calculations:

1. User clicks "Acknowledge" on a non_compliant result in the UI
2. The following fields are updated on the `compliance_results` row:
   - `acknowledged = true`
   - `acknowledged_at = now()`
   - `acknowledged_note = <user-provided text>`
   - `acknowledged_by = <org_user.id>`
3. Acknowledged results are excluded from compliance score calculations
4. Acknowledgments are preserved across re-evaluations (matched by `rule_id:resource_id` key)
5. Users can un-acknowledge by setting `acknowledged = false`

---

## Compliance Result Notes

Users can add timestamped notes to any compliance result:

- Notes are stored in `compliance_result_notes` with `compliance_result_id`, `note` text, and `created_by` (org_user FK)
- Multiple notes per result are supported
- Notes survive re-evaluations because they reference the result by ID (which changes on re-evaluation -- so notes cascade-delete with old results)
- The UI shows notes in a collapsible section per result

---

## Per-Account Rule Overrides

Admins can enable/disable specific rules for specific accounts:

- Stored in `account_rule_overrides` with unique `(account_id, rule_id)` constraint
- `is_active` boolean controls whether the rule is evaluated for this account
- `applied_by_profile_id` tracks which profile (if any) applied this override
- When a profile is activated for an account, overrides are bulk-created for all rules matching the profile's `rule_condition_types`

---

## Resource Relationships

The system tracks infrastructure dependencies:

| Relationship Type | Source Resource | Target Resource |
|---|---|---|
| `protects` | firewall | linode |
| `attached_to` | volume | linode |
| `contains` | vpc | linode |
| `contains` | vpc | database |

Relationships are rebuilt on each sync. The UI visualizes these as:
1. **Table view**: sorted list with source/target labels and relationship type
2. **Grouped view**: resources grouped by their connections
3. **Graph view**: interactive node-link diagram

---

## Config Change History (Snapshots)

The system records point-in-time snapshots of resource configurations:

- On each sync, if a resource's configuration has changed, a snapshot is created
- The `diff` field contains a JSON object mapping changed field names to `{ from, to }` values
- Diffs are computed by comparing the current resource state to the most recent snapshot
- The UI displays a timeline of changes with field-level diff highlighting

---

## Event Timeline

Linode API events are ingested during sync from `GET /v4/account/events`:

- Events include actions like `linode_create`, `linode_delete`, `firewall_create`, `disk_resize`, etc.
- Over 120 event action types are categorized in the UI into groups: compute, network, storage, security, kubernetes, database, account, DNS, support, other
- Events include entity information (type, label, URL), secondary entities, username, status, and timestamps
- The UI provides filtering by action category, entity type, status, username, and date range

---

## Compliance Reporting

### Reports View (4 tabs)

1. **Overview Tab**: Summary cards showing compliance score, total results broken down by status, severity distribution, and per-rule pass/fail counts
2. **By Resource Tab**: Table of resources with their compliance result counts, filterable by resource type, region, and compliance status
3. **By Rule Tab**: Table of rules with their result counts across all resources, filterable by severity and status
4. **Historical Trends Tab**: Time-series charts of compliance scores with 5 drill-down modes:
   - Score trend line chart
   - Stacked area chart of compliant/non_compliant/not_applicable counts
   - Per-rule breakdown over time
   - Per-severity breakdown over time
   - Animated timeline playback with scrubber

### Export

Reports can be exported as CSV with configurable options:
- All results or filtered subset
- Include/exclude acknowledged results
- Include/exclude not_applicable results

---

## Frontend UI Features

### Compliance Panel (`CompliancePanel.tsx`)
- Displays all compliance results for the selected account
- Filters by: status (compliant/non_compliant/not_applicable), severity (critical/warning/info), resource type, specific rule, search text
- Sorting by: status, severity, rule name, resource label, evaluated time
- Expandable rows showing full detail text, resource specs, and notes
- Acknowledge/un-acknowledge workflow with note input
- "Run Evaluation" button triggers server-side evaluation
- Summary bar showing counts and compliance score percentage

### Rule Manager (`RuleManagerView.tsx`)
- CRUD interface for compliance rules
- Form fields for all 30+ condition types with type-specific configuration inputs
- Condition config editors for: sensitive ports, allowed protocols, blocked ports, approved regions, required tags, forbidden CIDRs, etc.
- Severity picker (critical/warning/info)
- Resource type multi-select
- Active/inactive toggle
- Built-in rules are read-only (cannot be deleted, but can be deactivated via overrides)

### Composite Rule Builder (`CompositeRuleBuilder.tsx`)
- Visual builder for composite rules
- Dropdown to select operator (AND/OR/NOT/IF_THEN)
- Rule picker dropdowns for selecting sub-rules
- Dynamic form that adjusts based on selected operator

### Profiles View (`ProfilesView.tsx`)
- Displays all compliance profiles with their tier badges and descriptions
- Shows which rules are included in each profile
- "Activate for Account" button to apply a profile's rules to an account
- Activation creates `account_rule_overrides` for all matching rules

### Dashboard Summary Card (`ComplianceSummaryCard.tsx`)
- Compact widget showing: compliance score percentage, total findings count, critical/warning/info breakdown
- Color-coded score (green > 80%, amber > 60%, red <= 60%)
- Links to full compliance panel

### User Management (`UserManagementPanel.tsx`)
- Admin-only panel for managing org users
- Create/edit/delete users
- Role assignment (admin/power_user/auditor)
- Feature flag toggles (can_view_costs, can_view_compliance)
- Per-account access grants with per-account feature flags

---

## API Endpoints

### `POST /api/refresh`
Triggers resource sync and compliance evaluation.

**Request body:**
```json
{
  "account_id": "uuid (optional -- all accounts if omitted)",
  "skip_sync": false,
  "skip_eval": false
}
```

**Response:**
```json
{
  "success": true,
  "accounts_processed": 1,
  "results": [
    {
      "account_id": "uuid",
      "sync": { "success": true, "count": 42 },
      "eval": { "evaluated": 150, "compliant": 130, "non_compliant": 20 }
    }
  ],
  "log": ["[uuid] Starting resource sync...", "..."],
  "completed_at": "2026-03-13T..."
}
```

### `GET /api/refresh`
Same as POST but for cron/webhook triggers. Accepts `account_id` and `token` as query parameters.

### `GET /health`
Health check endpoint. Returns `{ "status": "ok", "timestamp": "..." }`.

### Authentication
The server API uses a shared secret (`REFRESH_API_SECRET` env var). Requests must include either:
- `Authorization: Bearer <secret>` header
- `?token=<secret>` query parameter

If the env var is not set, authentication is disabled.

---

## TypeScript Type Definitions

```typescript
type ComplianceSeverity = 'critical' | 'warning' | 'info';
type ComplianceStatus = 'compliant' | 'non_compliant' | 'not_applicable';

interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  resource_types: string[];
  condition_type: string;
  condition_config: Record<string, any>;
  severity: ComplianceSeverity;
  is_active: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

interface ComplianceResult {
  id: string;
  rule_id: string;
  resource_id: string;         // nullable for account-level rules
  account_id: string;
  status: ComplianceStatus;
  detail: string | null;
  evaluated_at: string;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_note: string | null;
  rule?: ComplianceRule;       // joined from compliance_rules
  resource?: Resource;         // joined from resources
}

interface ComplianceScoreHistory {
  id: string;
  account_id: string;
  evaluated_at: string;
  total_results: number;
  compliant_count: number;
  non_compliant_count: number;
  not_applicable_count: number;
  acknowledged_count: number;
  compliance_score: number | null;
  total_rules_evaluated: number;
  rule_breakdown: Array<{
    rule_id: string;
    rule_name: string;
    severity: string;
    compliant: number;
    non_compliant: number;
    not_applicable: number;
  }>;
  created_at: string;
}

interface Resource {
  id: string;
  account_id: string;
  resource_id: string;
  resource_type: string;
  label: string;
  region?: string;
  plan_type?: string;
  monthly_cost: number;
  status?: string;
  specs: any;                  // JSONB -- structure varies by resource_type
  pricing?: any;
  resource_created_at?: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
}

interface ResourceSnapshot {
  id: string;
  resource_id: string;
  account_id: string;
  resource_type: string;
  label: string;
  region?: string;
  plan_type?: string;
  monthly_cost: number;
  status?: string;
  specs: any;
  diff: Record<string, { from: any; to: any }> | null;
  synced_at: string;
  created_at: string;
}

interface ResourceRelationship {
  id: string;
  account_id: string;
  source_id: string;
  target_id: string;
  relationship_type: string;
  metadata?: any;
  synced_at: string;
  created_at: string;
  source?: Resource;
  target?: Resource;
}

interface LinodeEvent {
  id: string;
  account_id: string;
  event_id: number;
  action: string;
  entity_id: string | null;
  entity_type: string | null;
  entity_label: string | null;
  entity_url: string | null;
  secondary_entity_id: string | null;
  secondary_entity_type: string | null;
  secondary_entity_label: string | null;
  message: string | null;
  status: string | null;
  username: string | null;
  duration: number | null;
  percent_complete: number | null;
  seen: boolean;
  event_created: string | null;
  created_at: string;
}

interface LinodeAccount {
  id: string;
  name: string;
  api_token: string;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
  last_evaluated_at?: string;
}
```
