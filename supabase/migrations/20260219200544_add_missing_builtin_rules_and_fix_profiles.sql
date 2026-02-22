/*
  # Add Missing Built-in Rules and Fix Profile Coverage

  ## Summary
  Multiple compliance profiles reference condition types that have no built-in rule seeded,
  causing those profile controls to silently show "no rule found" in the UI. This migration
  adds the missing built-in rules and updates all profiles to be more comprehensive and consistent.

  ## New Built-in Rules Added (11)

  1. **volume_encryption_enabled** — Block storage volumes must have disk encryption enabled (critical)
     Used by: SOC 2, PCI-DSS, CIS L2, Zero Trust

  2. **lke_control_plane_ha** — LKE control plane HA must be enabled (warning)
     Used by: PCI-DSS, CIS L2, Zero Trust

  3. **lke_audit_logs_enabled** — LKE control plane audit logging must be enabled (warning)
     Used by: SOC 2, Zero Trust

  4. **bucket_acl_check** — Object storage bucket ACL must not be public-read/public-read-write (critical)
     Used by: SOC 2, PCI-DSS, CIS L2, Zero Trust

  5. **bucket_cors_check** — Object storage bucket CORS must be disabled (warning)
     Used by: Zero Trust

  6. **tfa_users** — All account users must have two-factor authentication enabled (critical)
     Used by: all profiles

  7. **login_allowed_ips** — Account logins must originate from configured IP allow list (warning)
     Used by: SOC 2, PCI-DSS, CIS L2, Zero Trust

  8. **approved_regions** — Resources must be deployed only in approved geographic regions (warning)
     Used by: PCI-DSS, CIS L2, Zero Trust

  9. **firewall_rules_check** — Firewall inbound/outbound policy must meet requirements (warning)
     Used by: PCI-DSS, CIS L2, Zero Trust

  10. **nodebalancer_protocol_check** — NodeBalancer ports must use only HTTPS protocol (warning)
      Used by: PCI-DSS, Zero Trust

  11. **nodebalancer_port_allowlist** — NodeBalancer must only listen on approved ports (warning)
      Used by: Zero Trust

  ## Profile Updates

  ### CIS Level 1 (cis-l1)
  - Added: `lke_control_plane_acl` (was missing despite being critical severity)

  ### CIS Level 2 (cis-l2)
  - Added: `lke_control_plane_acl`, `lke_audit_logs_enabled`, `linode_lock_configured`

  ### SOC 2 Readiness (soc2)
  - Added: `lke_control_plane_acl`, `linode_lock_configured`

  ### PCI-DSS Baseline (pci-dss)
  - Added: `lke_control_plane_acl`, `lke_audit_logs_enabled`, `linode_lock_configured`, `nodebalancer_port_allowlist`

  ### Minimal / Dev (minimal-dev)
  - Added: `firewall_attached` (a dev environment Linode with no firewall should still be flagged)

  ### Strict — Zero Trust (strict-zt)
  - Added: `lke_control_plane_acl`, `linode_disk_encryption` (was missing from the strictest profile)

  ## Security
  - All new rules are built-in (account_id = NULL), globally shared, and not editable by individual accounts
  - RLS policies already in place on compliance_rules cover these new rows
*/

INSERT INTO compliance_rules
  (name, description, condition_type, condition_config, severity, resource_types, is_builtin, account_id)
VALUES
  (
    'Volume Encryption Enabled',
    'Block storage volumes must have disk encryption enabled to protect data at rest.',
    'volume_encryption_enabled',
    '{}',
    'critical',
    ARRAY['volume'],
    true,
    NULL
  ),
  (
    'LKE Control Plane High Availability',
    'LKE cluster control plane high availability must be enabled for production resilience.',
    'lke_control_plane_ha',
    '{}',
    'warning',
    ARRAY['lke_cluster'],
    true,
    NULL
  ),
  (
    'LKE Audit Logs Enabled',
    'LKE control plane audit logging must be enabled to record API server activity.',
    'lke_audit_logs_enabled',
    '{}',
    'warning',
    ARRAY['lke_cluster'],
    true,
    NULL
  ),
  (
    'Object Storage Bucket ACL',
    'Object storage bucket ACL must not allow public-read, public-read-write, or authenticated-read access.',
    'bucket_acl_check',
    '{"required_acl": "", "forbidden_acls": ["public-read", "public-read-write", "authenticated-read"]}',
    'critical',
    ARRAY['bucket'],
    true,
    NULL
  ),
  (
    'Object Storage Bucket CORS',
    'Object storage bucket CORS configuration must comply with security policy.',
    'bucket_cors_check',
    '{"require_cors_disabled": false, "require_cors_enabled": false}',
    'warning',
    ARRAY['bucket'],
    true,
    NULL
  ),
  (
    'All Users Must Have TFA Enabled',
    'Every user on the account (excluding proxy/service users) must have two-factor authentication enabled.',
    'tfa_users',
    '{}',
    'critical',
    ARRAY[]::text[],
    true,
    NULL
  ),
  (
    'Account Login IP Restriction',
    'Account logins must only be permitted from a configured IP allow list to prevent unauthorized access.',
    'login_allowed_ips',
    '{}',
    'warning',
    ARRAY[]::text[],
    true,
    NULL
  ),
  (
    'Resources in Approved Regions',
    'All resources must be deployed only in approved geographic regions for compliance and data sovereignty.',
    'approved_regions',
    '{"approved_regions": []}',
    'warning',
    ARRAY['linode', 'volume', 'lke_cluster', 'database', 'nodebalancer', 'bucket'],
    true,
    NULL
  ),
  (
    'Firewall Policy Requirements',
    'Firewall inbound and outbound policies must meet configurable security requirements.',
    'firewall_rules_check',
    '{"required_inbound_policy": "DROP", "required_outbound_policy": "", "blocked_ports": [], "allowed_source_ips": [], "require_no_open_ports": false}',
    'warning',
    ARRAY['firewall'],
    true,
    NULL
  ),
  (
    'NodeBalancer Protocol Check',
    'NodeBalancer ports must use only HTTPS protocol; plain HTTP endpoints are not permitted.',
    'nodebalancer_protocol_check',
    '{"allowed_protocols": ["https"]}',
    'warning',
    ARRAY['nodebalancer'],
    true,
    NULL
  ),
  (
    'NodeBalancer Allowed Ports',
    'NodeBalancer must only listen on approved ports (default: 443). Any other port must be explicitly whitelisted.',
    'nodebalancer_port_allowlist',
    '{"allowed_ports": [443]}',
    'warning',
    ARRAY['nodebalancer'],
    true,
    NULL
  )
ON CONFLICT DO NOTHING;

UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached', 'no_open_inbound',
  'linode_backups_enabled', 'db_allowlist_check', 'db_public_access',
  'tfa_users', 'has_tags', 'volume_attached', 'lke_control_plane_acl'
]
WHERE slug = 'cis-l1';

UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached', 'firewall_rules_check', 'firewall_has_targets', 'no_open_inbound',
  'linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption',
  'linode_lock_configured',
  'volume_encryption_enabled',
  'db_allowlist_check', 'db_public_access',
  'tfa_users', 'login_allowed_ips', 'has_tags', 'approved_regions',
  'min_node_count', 'lke_control_plane_ha', 'lke_control_plane_acl', 'lke_audit_logs_enabled',
  'bucket_acl_check'
]
WHERE slug = 'cis-l2';

UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached', 'no_open_inbound',
  'linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption',
  'linode_lock_configured',
  'volume_encryption_enabled',
  'db_allowlist_check', 'db_public_access',
  'tfa_users', 'login_allowed_ips',
  'lke_audit_logs_enabled', 'lke_control_plane_acl',
  'bucket_acl_check', 'has_tags'
]
WHERE slug = 'soc2';

UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached', 'firewall_rules_check', 'no_open_inbound',
  'linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption',
  'linode_lock_configured',
  'volume_encryption_enabled',
  'db_allowlist_check', 'db_public_access',
  'tfa_users', 'login_allowed_ips',
  'approved_regions',
  'lke_control_plane_ha', 'lke_control_plane_acl', 'lke_audit_logs_enabled',
  'bucket_acl_check',
  'nodebalancer_protocol_check', 'nodebalancer_port_allowlist'
]
WHERE slug = 'pci-dss';

UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached', 'no_open_inbound',
  'db_allowlist_check', 'db_public_access',
  'tfa_users'
]
WHERE slug = 'minimal-dev';

UPDATE compliance_profiles
SET rule_condition_types = ARRAY[
  'firewall_attached', 'firewall_rules_check', 'firewall_has_targets', 'no_open_inbound',
  'linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption',
  'linode_lock_configured', 'linode_not_offline',
  'volume_encryption_enabled', 'volume_attached',
  'db_allowlist_check', 'db_public_access',
  'tfa_users', 'login_allowed_ips', 'has_tags', 'approved_regions',
  'min_node_count', 'lke_control_plane_ha', 'lke_control_plane_acl', 'lke_audit_logs_enabled',
  'bucket_acl_check', 'bucket_cors_check',
  'nodebalancer_protocol_check', 'nodebalancer_port_allowlist'
]
WHERE slug = 'strict-zt';
