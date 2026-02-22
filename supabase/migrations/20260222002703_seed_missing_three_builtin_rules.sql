/*
  # Seed 3 Missing Built-in Rules

  The "All Rules" profile references 28 condition types but only 26 rules exist in
  compliance_rules. Three condition types are missing:

  1. bucket_cors_check   — evaluator exists; was seeded then deleted by an earlier
                           migration, but the deletion was an error since the evaluator
                           is still active in the codebase.
  2. firewall_rfc1918_lateral — evaluator exists; was never seeded.
  3. firewall_no_duplicate_rules — evaluator exists; was never seeded.

  This migration seeds all three so the rule count matches the profile's 28 rule types.
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin, account_id)
SELECT v.name, v.description, v.resource_types, v.condition_type, v.condition_config::jsonb, v.severity, true, NULL
FROM (VALUES
  (
    'Object Storage Bucket CORS',
    'Checks whether CORS is enabled or disabled on object storage buckets. By default, buckets should not have CORS enabled unless explicitly required, as it can expose bucket contents to cross-origin requests.',
    ARRAY['bucket'],
    'bucket_cors_check',
    '{"require_cors_disabled": false, "require_cors_enabled": false}',
    'info'
  ),
  (
    'No RFC-1918 lateral movement via firewall',
    'Detects inbound firewall rules that allow sensitive port traffic from RFC-1918 private IP ranges (10.x, 172.16-31.x, 192.168.x). Such rules may permit lateral movement within a private network or VPC.',
    ARRAY['firewall'],
    'firewall_rfc1918_lateral',
    '{"sensitive_ports": [22, 3389, 3306, 5432, 5984, 6379, 9200, 27017]}',
    'warning'
  ),
  (
    'No duplicate firewall rules',
    'Detects inbound or outbound firewall rules that are exact duplicates of another rule in the same direction. Duplicate rules are redundant, increase the chance of misconfiguration, and make auditing harder.',
    ARRAY['firewall'],
    'firewall_no_duplicate_rules',
    '{}',
    'info'
  )
) AS v(name, description, resource_types, condition_type, condition_config, severity)
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules cr
  WHERE cr.condition_type = v.condition_type AND cr.account_id IS NULL
);
