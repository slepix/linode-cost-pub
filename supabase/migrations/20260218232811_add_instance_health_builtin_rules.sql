/*
  # Add Instance Health & Security built-in compliance rules

  ## Summary
  Adds 4 new built-in compliance rules for Linode instance health and security checks:

  1. Backups Enabled — checks that automated backups are enabled on each Linode
  2. Disk Encryption — checks that disk encryption is set to "enabled" on each Linode
  3. Lock Configured — checks that at least one deletion lock is configured on each Linode
  4. Instance Not Offline — flags Linodes that are in an "offline" state

  These rules are global (account_id = NULL) and built-in (is_builtin = true).
  They will be visible to all accounts in the Rule Manager.
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_active, is_builtin, account_id)
VALUES
  (
    'Linode Backups Enabled',
    'Verifies that automated backups are enabled for every Linode instance. Backups protect against accidental data loss.',
    ARRAY['linode'],
    'linode_backups_enabled',
    '{}',
    'warning',
    true,
    true,
    NULL
  ),
  (
    'Linode Disk Encryption Enabled',
    'Verifies that disk encryption is enabled on every Linode instance. Encryption protects data at rest.',
    ARRAY['linode'],
    'linode_disk_encryption',
    '{}',
    'warning',
    true,
    true,
    NULL
  ),
  (
    'Linode Deletion Lock Configured',
    'Verifies that at least one deletion lock (cannot_delete or cannot_delete_with_subresources) is configured to protect the instance from accidental deletion.',
    ARRAY['linode'],
    'linode_lock_configured',
    '{"required_lock_types": []}',
    'info',
    true,
    true,
    NULL
  ),
  (
    'Linode Instance Not Offline',
    'Flags any Linode instance that is currently in an offline state. Offline instances may indicate a misconfiguration, failure, or unintended shutdown.',
    ARRAY['linode'],
    'linode_not_offline',
    '{}',
    'warning',
    true,
    true,
    NULL
  )
ON CONFLICT DO NOTHING;
