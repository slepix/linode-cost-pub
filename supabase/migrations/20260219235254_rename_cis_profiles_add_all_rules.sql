/*
  # Rename CIS profiles and add All Rules profile

  1. Changes
    - Remove "CIS" from profile names: "CIS Level 1 — Foundation" -> "Level 1 — Foundation", "CIS Level 2 — Standard" -> "Level 2 — Standard"
  2. New Profile
    - "All Rules" profile with slug "all-rules" at tier "strict" that includes every available condition type
*/

UPDATE compliance_profiles
SET name = 'Level 1 — Foundation'
WHERE slug = 'cis-l1';

UPDATE compliance_profiles
SET name = 'Level 2 — Standard'
WHERE slug = 'cis-l2';

INSERT INTO compliance_profiles (id, name, slug, description, tier, is_builtin, version, icon, rule_condition_types)
VALUES (
  gen_random_uuid(),
  'All Rules',
  'all-rules',
  'Enables every available compliance rule. Use this to get full visibility across all checks — useful for auditing, onboarding, or building a custom baseline.',
  'strict',
  true,
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
  ]
)
ON CONFLICT (slug) DO NOTHING;
