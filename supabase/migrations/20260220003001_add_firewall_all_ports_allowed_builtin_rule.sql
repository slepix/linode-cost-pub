/*
  # Add firewall_all_ports_allowed built-in compliance rule

  ## Summary
  Adds a new built-in compliance rule that detects firewall rules which allow
  traffic on all ports. This is a common misconfiguration where rules use the
  ALL protocol, an empty port range, or the full range 1-65535 — all of which
  permit unrestricted port access.

  ## New Rule
  - **Name:** Firewall rules must not allow all ports
  - **Condition type:** firewall_all_ports_allowed
  - **Resource types:** firewall
  - **Severity:** warning
  - **Default config:**
    - check_inbound: true — checks inbound rules by default
    - check_outbound: false — outbound not checked by default
    - actions: ["ACCEPT"] — only flags ACCEPT rules by default

  ## Notes
  - The rule is built-in (is_builtin = true) and account-agnostic (account_id = NULL)
  - Uses INSERT ... ON CONFLICT DO NOTHING to be idempotent
*/

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin, account_id)
SELECT
  'Firewall rules must not allow all ports',
  'Detects inbound or outbound firewall rules that allow traffic on all ports — either through a protocol of ALL, an empty port range, or the full range 1-65535. Such rules are overly permissive and should be replaced with specific port allowances.',
  ARRAY['firewall'],
  'firewall_all_ports_allowed',
  '{"check_inbound": true, "check_outbound": false, "actions": ["ACCEPT"]}'::jsonb,
  'warning',
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE condition_type = 'firewall_all_ports_allowed' AND is_builtin = true
);
