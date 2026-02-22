/*
  # Update Compliance Rule Severities + Add Profiles

  ## Changes

  ### 1. Severity Corrections (built-in rules)
  Aligning severities with actual risk level, inspired by CIS Benchmark severity model:

  - `linode_disk_encryption` → critical
    Unencrypted disks expose all data at rest. CIS 4.x — required for regulated data.

  - `linode_backups_enabled` → critical
    No backup = unrecoverable data loss. CIS 10.x / SOC2 A1.2.

  - `linode_backup_recency` → warning
    Backup configured but stale. Important but less urgent than "no backup at all".

  - `linode_not_offline` → warning
    Offline instances are an operational concern, not a direct security risk. Stays warning.

  - `firewall_has_targets` → info
    Orphaned firewalls are a hygiene issue, not an active threat. Downgrade to info.

  - `min_node_count` → warning
    Availability risk but not a security vulnerability. Stays warning.

  - `linode_lock_configured` → warning
    Deletion protection is a meaningful operational safeguard. Upgrade from info.

  - `has_tags` → info
    Governance/FinOps hygiene. Stays info.

  - `volume_attached` → info
    Cost hygiene. Downgrade from warning since it's a cost issue, not a security risk.

  ### 2. Add SOC2 + PCI-DSS + Minimal/Dev built-in profiles
  These complement the existing CIS L1, CIS L2, and Zero Trust profiles already seeded.
*/

-- Severity updates for built-in rules
UPDATE compliance_rules SET severity = 'critical', updated_at = now()
WHERE condition_type = 'linode_disk_encryption' AND is_builtin = true;

UPDATE compliance_rules SET severity = 'critical', updated_at = now()
WHERE condition_type = 'linode_backups_enabled' AND is_builtin = true;

UPDATE compliance_rules SET severity = 'warning', updated_at = now()
WHERE condition_type = 'linode_backup_recency' AND is_builtin = true;

UPDATE compliance_rules SET severity = 'info', updated_at = now()
WHERE condition_type = 'firewall_has_targets' AND is_builtin = true;

UPDATE compliance_rules SET severity = 'warning', updated_at = now()
WHERE condition_type = 'linode_lock_configured' AND is_builtin = true;

UPDATE compliance_rules SET severity = 'info', updated_at = now()
WHERE condition_type = 'volume_attached' AND is_builtin = true;

-- Add SOC 2 profile (if not already present)
INSERT INTO compliance_profiles (name, slug, description, tier, version, icon, rule_condition_types, is_builtin)
SELECT
  'SOC 2 Readiness',
  'soc2',
  'Maps controls to the SOC 2 Trust Service Criteria — Security (CC6/CC7), Availability (A1), and Confidentiality (C1). Designed to support audit readiness for Type I and Type II assessments.',
  'standard',
  '1.0',
  'file-check',
  ARRAY[
    'firewall_attached',
    'no_open_inbound',
    'linode_backups_enabled',
    'linode_backup_recency',
    'linode_disk_encryption',
    'volume_encryption_enabled',
    'db_allowlist_check',
    'db_public_access',
    'tfa_users',
    'login_allowed_ips',
    'lke_audit_logs_enabled',
    'bucket_acl_check',
    'has_tags'
  ],
  true
WHERE NOT EXISTS (SELECT 1 FROM compliance_profiles WHERE slug = 'soc2');

-- Add PCI-DSS profile (if not already present)
INSERT INTO compliance_profiles (name, slug, description, tier, version, icon, rule_condition_types, is_builtin)
SELECT
  'PCI-DSS Baseline',
  'pci-dss',
  'Subset of controls aligned to PCI DSS v4.0 Requirements 1 (Network Security), 2 (Secure Configs), 3 (Data Protection), 7 (Access Control), and 10 (Audit Logging). Intended as a starting point — a full PCI assessment requires additional controls.',
  'strict',
  '1.0',
  'credit-card',
  ARRAY[
    'firewall_attached',
    'firewall_rules_check',
    'no_open_inbound',
    'linode_backups_enabled',
    'linode_backup_recency',
    'linode_disk_encryption',
    'volume_encryption_enabled',
    'db_allowlist_check',
    'db_public_access',
    'tfa_users',
    'login_allowed_ips',
    'approved_regions',
    'lke_control_plane_ha',
    'bucket_acl_check',
    'nodebalancer_protocol_check'
  ],
  true
WHERE NOT EXISTS (SELECT 1 FROM compliance_profiles WHERE slug = 'pci-dss');

-- Add Minimal/Dev profile (if not already present)
INSERT INTO compliance_profiles (name, slug, description, tier, version, icon, rule_condition_types, is_builtin)
SELECT
  'Minimal / Dev',
  'minimal-dev',
  'Lightweight profile for development and staging accounts. Only critical blocking issues are flagged — avoids noise on non-production infrastructure where strict controls are impractical. Not suitable for production.',
  'foundation',
  '1.0',
  'wrench',
  ARRAY[
    'no_open_inbound',
    'db_allowlist_check',
    'db_public_access',
    'tfa_users'
  ],
  true
WHERE NOT EXISTS (SELECT 1 FROM compliance_profiles WHERE slug = 'minimal-dev');
