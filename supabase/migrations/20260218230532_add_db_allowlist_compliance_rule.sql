/*
  # Add built-in compliance rule: Managed database IP allow list check

  ## Summary
  Adds a new built-in compliance rule that checks whether managed database
  instances have unsafe or overly-permissive IP addresses in their allow list.

  ## New Built-in Rule
  - **Name:** No unrestricted database access
  - **Condition type:** db_allowlist_check
  - **Resource types:** database
  - **Severity:** critical
  - **Default config:** Flags CIDRs 0.0.0.0/0 and ::/0 in the allow list

  ## Notes
  - The rule is marked is_builtin = true so it cannot be deleted by users
  - condition_config.forbidden_cidrs lists CIDRs considered unrestricted
  - condition_config.require_non_empty is false by default (empty allow list
    may be intentional when the DB is inside a VPC with no public access)
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin)
VALUES (
  'No unrestricted database access',
  'Managed databases should not have 0.0.0.0/0 or ::/0 in their IP allow list, as this exposes the database endpoint to the public internet.',
  ARRAY['database'],
  'db_allowlist_check',
  '{"forbidden_cidrs": ["0.0.0.0/0", "::/0"], "require_non_empty": false}',
  'critical',
  true
)
ON CONFLICT DO NOTHING;
