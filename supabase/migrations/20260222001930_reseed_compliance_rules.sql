/*
  # Reseed All Built-in Compliance Rules

  The compliance_rules table is empty because the incremental migrations that seeded
  built-in rules did not run against this database instance. This migration applies the
  complete final state of all 26 built-in rules using INSERT ... WHERE NOT EXISTS to
  avoid duplicates if re-run.

  Final state reflects all updates and deletes from incremental migrations:
  - Severity corrections applied (linode_disk_encryption/backups_enabled → critical, etc.)
  - firewall_rules_check resource_types corrected to ['linode']
  - bucket_cors_check removed (deleted in migration 20260220004210)
  - firewall_rule_labels renamed to firewall_rule_descriptions
  - db_allowlist_check condition_config updated with require_non_empty
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin, account_id)
SELECT v.name, v.description, v.resource_types, v.condition_type, v.condition_config::jsonb, v.severity, true, NULL
FROM (VALUES
  ('Linodes must have a firewall', 'Every Linode instance should be protected by at least one active firewall.', ARRAY['linode'], 'firewall_attached', '{}', 'critical'),
  ('No unrestricted inbound traffic', 'Firewall rules should not allow unrestricted inbound access (0.0.0.0/0 or ::/0) on sensitive ports.', ARRAY['firewall'], 'no_open_inbound', '{"sensitive_ports": [22, 3389, 3306, 5432, 6379, 27017]}', 'critical'),
  ('Firewall must be attached', 'A firewall that is not attached to any Linode provides no value.', ARRAY['firewall'], 'firewall_has_targets', '{}', 'info'),
  ('LKE clusters should have multiple nodes', 'Kubernetes clusters should have more than one node for high availability.', ARRAY['lke_cluster'], 'min_node_count', '{"min_count": 2}', 'warning'),
  ('Resources should have tags', 'Resources must have owner, environment, and cost-center tags for accountability, automation, and cost tracking.', ARRAY['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database'], 'has_tags', '{"required_tags": [{"key": "owner", "value": "*"}, {"key": "environment", "value": "*"}, {"key": "cost-center", "value": "*"}]}', 'info'),
  ('Volumes should be attached', 'Unattached volumes still incur cost but provide no value.', ARRAY['volume'], 'volume_attached', '{}', 'info'),
  ('No unrestricted database access', 'Managed databases should not have 0.0.0.0/0 or ::/0 in their IP allow list, as this exposes the database endpoint to the public internet.', ARRAY['database'], 'db_allowlist_check', '{"forbidden_cidrs": ["0.0.0.0/0", "::/0"], "require_non_empty": false}', 'critical'),
  ('Databases must not have public access enabled', 'Managed databases with public_access enabled are reachable from outside the VPC, which increases the attack surface.', ARRAY['database'], 'db_public_access', '{"allow_public_access": false}', 'critical'),
  ('Linode Backups Enabled', 'Verifies that automated backups are enabled for every Linode instance. Backups protect against accidental data loss.', ARRAY['linode'], 'linode_backups_enabled', '{}', 'critical'),
  ('Linode Disk Encryption Enabled', 'Verifies that disk encryption is enabled on every Linode instance. Encryption protects data at rest.', ARRAY['linode'], 'linode_disk_encryption', '{}', 'critical'),
  ('Linode Deletion Lock Configured', 'Verifies that at least one deletion lock is configured to protect the instance from accidental deletion.', ARRAY['linode'], 'linode_lock_configured', '{"required_lock_types": []}', 'warning'),
  ('Linode Instance Not Offline', 'Flags any Linode instance that is currently in an offline state. Offline instances may indicate a misconfiguration, failure, or unintended shutdown.', ARRAY['linode'], 'linode_not_offline', '{}', 'warning'),
  ('All Linodes must have a recent successful backup', 'Verifies that a successful backup has occurred within the last 7 days. Linodes with no backup or an outdated backup will be flagged.', ARRAY['linode'], 'linode_backup_recency', '{"max_age_days": 7}', 'warning'),
  ('LKE Control Plane ACL Configured', 'Verifies that the LKE cluster control plane has an ACL enabled and does not allow unrestricted access from 0.0.0.0/0 or ::/0.', ARRAY['lke_cluster'], 'lke_control_plane_acl', '{}', 'critical'),
  ('Volume Encryption Enabled', 'Block storage volumes must have disk encryption enabled to protect data at rest.', ARRAY['volume'], 'volume_encryption_enabled', '{}', 'critical'),
  ('LKE Control Plane High Availability', 'LKE cluster control plane high availability must be enabled for production resilience.', ARRAY['lke_cluster'], 'lke_control_plane_ha', '{}', 'warning'),
  ('LKE Audit Logs Enabled', 'LKE control plane audit logging must be enabled to record API server activity.', ARRAY['lke_cluster'], 'lke_audit_logs_enabled', '{}', 'warning'),
  ('Object Storage Bucket ACL', 'Object storage bucket ACL must not allow public-read, public-read-write, or authenticated-read access.', ARRAY['bucket'], 'bucket_acl_check', '{"required_acl": "", "forbidden_acls": ["public-read", "public-read-write", "authenticated-read"]}', 'critical'),
  ('All Users Must Have TFA Enabled', 'Every user on the account (excluding proxy/service users) must have two-factor authentication enabled.', ARRAY[]::text[], 'tfa_users', '{}', 'critical'),
  ('Account Login IP Restriction', 'Account logins must only be permitted from a configured IP allow list to prevent unauthorized access.', ARRAY[]::text[], 'login_allowed_ips', '{}', 'warning'),
  ('Resources in Approved Regions', 'All resources must be deployed only in approved geographic regions for compliance and data sovereignty.', ARRAY['linode', 'volume', 'lke_cluster', 'database', 'nodebalancer', 'bucket'], 'approved_regions', '{"approved_regions": []}', 'warning'),
  ('Firewall Policy Requirements', 'Firewall inbound and outbound policies must meet configurable security requirements.', ARRAY['linode'], 'firewall_rules_check', '{"required_inbound_policy": "DROP", "required_outbound_policy": "", "blocked_ports": [], "allowed_source_ips": [], "require_no_open_ports": false}', 'warning'),
  ('NodeBalancer Protocol Check', 'NodeBalancer ports must use only HTTPS protocol; plain HTTP endpoints are not permitted.', ARRAY['nodebalancer'], 'nodebalancer_protocol_check', '{"allowed_protocols": ["https"]}', 'warning'),
  ('NodeBalancer Allowed Ports', 'NodeBalancer must only listen on approved ports (default: 443). Any other port must be explicitly whitelisted.', ARRAY['nodebalancer'], 'nodebalancer_port_allowlist', '{"allowed_ports": [443]}', 'warning'),
  ('Firewall rules must not allow all ports', 'Detects inbound or outbound firewall rules that allow traffic on all ports. Such rules are overly permissive and should be replaced with specific port allowances.', ARRAY['firewall'], 'firewall_all_ports_allowed', '{"check_inbound": true, "check_outbound": false, "actions": ["ACCEPT"]}', 'warning'),
  ('Every firewall rule must have a description', 'Checks that all inbound and outbound firewall rules have a non-empty description set. Descriptions help document the purpose of each rule and reduce the risk of misconfigurations.', ARRAY['firewall'], 'firewall_rule_descriptions', '{}', 'warning')
) AS v(name, description, resource_types, condition_type, condition_config, severity)
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules cr
  WHERE cr.condition_type = v.condition_type AND cr.account_id IS NULL
);
