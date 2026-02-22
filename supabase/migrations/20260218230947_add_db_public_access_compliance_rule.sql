/*
  # Add built-in compliance rule: Managed database public access check

  ## Summary
  Adds a new built-in compliance rule that flags managed database instances
  that have public_access enabled in their private_network configuration.

  ## New Built-in Rule
  - **Name:** Databases must not have public access enabled
  - **Condition type:** db_public_access
  - **Resource types:** database
  - **Severity:** critical
  - **Default config:** allow_public_access = false (any public_access: true is a violation)

  ## Notes
  - is_builtin = true so it cannot be deleted by users
  - allow_public_access can be set to true in the rule config if public access
    is intentionally permitted in a given environment
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin)
VALUES (
  'Databases must not have public access enabled',
  'Managed databases with public_access enabled in their VPC private network configuration are reachable from outside the VPC, which increases the attack surface.',
  ARRAY['database'],
  'db_public_access',
  '{"allow_public_access": false}',
  'critical',
  true
)
ON CONFLICT DO NOTHING;
