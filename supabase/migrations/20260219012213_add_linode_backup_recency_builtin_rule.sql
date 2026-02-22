/*
  # Add Linode Backup Recency Built-in Rule

  ## Summary
  Adds a new built-in compliance rule that verifies Linodes have an actual recent
  successful backup, rather than just checking whether backups are configured/enabled.

  ## New Built-in Rule
  - **linode_backup_recency**: Checks the `last_successful` backup timestamp from the
    Linode API. A Linode is non-compliant if:
    - Backups are disabled entirely, OR
    - No successful backup has ever been recorded, OR
    - The most recent successful backup is older than the configured threshold (default: 7 days)

  ## Condition Config
  - `max_age_days` (integer, default 7): Maximum age in days for the most recent
    successful backup before the instance is flagged as non-compliant.

  ## Notes
  - This rule is distinct from `linode_backups_enabled` which only checks the
    enabled flag. This rule checks the actual backup timestamp.
  - The rule is account-scoped (account_id = NULL = global built-in).
  - Uses `IF NOT EXISTS` pattern via a DO block to be idempotent.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM compliance_rules
    WHERE condition_type = 'linode_backup_recency'
      AND account_id IS NULL
      AND is_builtin = true
  ) THEN
    INSERT INTO compliance_rules (
      name,
      description,
      resource_types,
      condition_type,
      condition_config,
      severity,
      is_active,
      is_builtin,
      account_id
    ) VALUES (
      'All Linodes must have a recent successful backup',
      'Verifies that a successful backup has actually occurred within the last 7 days by checking the last_successful backup timestamp — not just whether backups are configured. Linodes with no backup or an outdated backup will be flagged.',
      ARRAY['linode'],
      'linode_backup_recency',
      '{"max_age_days": 7}'::jsonb,
      'warning',
      true,
      true,
      NULL
    );
  END IF;
END $$;
