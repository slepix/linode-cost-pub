/*
  # Reseed Built-in Compliance Profiles

  The compliance_profiles table is empty because the original seed data was applied via
  incremental migrations that assumed prior data existed. This migration does a full upsert
  of all built-in profiles with their final rule_condition_types.

  Profiles seeded:
  1. Level 1 — Foundation (cis-l1): Foundational low-friction controls
  2. Level 2 — Standard (cis-l2): Deeper technical controls for production
  3. SOC 2 Readiness (soc2): Trust Service Criteria coverage
  4. PCI-DSS Baseline (pci-dss): PCI DSS v4.0 aligned controls
  5. Minimal / Dev (minimal-dev): Lightweight profile for dev/staging
  6. All Rules (all-rules): Every available compliance rule enabled
*/

INSERT INTO compliance_profiles (name, slug, description, tier, version, icon, rule_condition_types, is_builtin)
VALUES
  (
    'Level 1 — Foundation',
    'cis-l1',
    'Covers foundational, low-friction controls — the checks that every cloud account should satisfy regardless of risk appetite.',
    'foundation',
    'v1.0',
    'shield',
    ARRAY[
      'firewall_attached', 'no_open_inbound',
      'linode_backups_enabled', 'db_allowlist_check', 'db_public_access',
      'tfa_users', 'has_tags', 'volume_attached', 'lke_control_plane_acl'
    ],
    true
  ),
  (
    'Level 2 — Standard',
    'cis-l2',
    'Adds deeper technical controls on top of the foundational set, appropriate for production workloads requiring defense in depth.',
    'standard',
    'v1.0',
    'shield-check',
    ARRAY[
      'firewall_attached', 'firewall_rules_check', 'firewall_has_targets', 'no_open_inbound',
      'linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption',
      'linode_lock_configured',
      'volume_encryption_enabled',
      'db_allowlist_check', 'db_public_access',
      'tfa_users', 'login_allowed_ips', 'has_tags', 'approved_regions',
      'min_node_count', 'lke_control_plane_ha', 'lke_control_plane_acl', 'lke_audit_logs_enabled',
      'bucket_acl_check'
    ],
    true
  ),
  (
    'SOC 2 Readiness',
    'soc2',
    'Maps controls to the SOC 2 Trust Service Criteria — Security (CC6/CC7), Availability (A1), and Confidentiality (C1). Designed to support audit readiness for Type I and Type II assessments.',
    'standard',
    '1.0',
    'file-check',
    ARRAY[
      'firewall_attached', 'no_open_inbound',
      'linode_backups_enabled', 'linode_backup_recency', 'linode_disk_encryption',
      'linode_lock_configured',
      'volume_encryption_enabled',
      'db_allowlist_check', 'db_public_access',
      'tfa_users', 'login_allowed_ips',
      'lke_audit_logs_enabled', 'lke_control_plane_acl',
      'bucket_acl_check', 'has_tags'
    ],
    true
  ),
  (
    'PCI-DSS Baseline',
    'pci-dss',
    'Subset of controls aligned to PCI DSS v4.0 Requirements 1 (Network Security), 2 (Secure Configs), 3 (Data Protection), 7 (Access Control), and 10 (Audit Logging). Intended as a starting point — a full PCI assessment requires additional controls.',
    'strict',
    '1.0',
    'credit-card',
    ARRAY[
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
    ],
    true
  ),
  (
    'Minimal / Dev',
    'minimal-dev',
    'Lightweight profile for development and staging accounts. Only critical blocking issues are flagged — avoids noise on non-production infrastructure where strict controls are impractical. Not suitable for production.',
    'foundation',
    '1.0',
    'wrench',
    ARRAY[
      'firewall_attached', 'no_open_inbound',
      'db_allowlist_check', 'db_public_access',
      'tfa_users'
    ],
    true
  ),
  (
    'All Rules',
    'all-rules',
    'Enables every available compliance rule. Use this to get full visibility across all checks — useful for auditing, onboarding, or building a custom baseline.',
    'strict',
    'v1.0',
    'shield-check',
    ARRAY[
      'approved_regions',
      'bucket_acl_check',
      'bucket_cors_check',
      'db_allowlist_check',
      'db_public_access',
      'firewall_attached',
      'firewall_has_targets',
      'firewall_no_duplicate_rules',
      'firewall_rfc1918_lateral',
      'firewall_rule_descriptions',
      'firewall_rules_check',
      'has_tags',
      'linode_backup_recency',
      'linode_backups_enabled',
      'linode_disk_encryption',
      'linode_lock_configured',
      'linode_not_offline',
      'lke_audit_logs_enabled',
      'lke_control_plane_acl',
      'lke_control_plane_ha',
      'login_allowed_ips',
      'min_node_count',
      'no_open_inbound',
      'nodebalancer_port_allowlist',
      'nodebalancer_protocol_check',
      'tfa_users',
      'volume_attached',
      'volume_encryption_enabled'
    ],
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tier = EXCLUDED.tier,
  version = EXCLUDED.version,
  icon = EXCLUDED.icon,
  rule_condition_types = EXCLUDED.rule_condition_types,
  is_builtin = EXCLUDED.is_builtin,
  updated_at = now();
