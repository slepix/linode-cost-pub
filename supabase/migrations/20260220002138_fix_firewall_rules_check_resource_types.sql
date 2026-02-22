/*
  # Fix firewall_rules_check rule resource_types

  ## Problem
  The built-in `firewall_rules_check` compliance rule was stored with
  `resource_types = ['firewall']`, but the evaluation logic iterates
  Linode resources and looks for attached firewalls on each Linode.

  When the evaluator iterates firewall resources instead of Linodes,
  `specs.attached_firewalls` is absent on firewall specs, and the
  entity-based lookup uses the firewall's own ID as a Linode ID — which
  never matches. This causes every Linode to incorrectly report
  "No firewall is attached to this Linode."

  ## Fix
  Update `resource_types` to `['linode']` so the evaluator correctly
  iterates Linode resources and checks their attached firewalls.
*/

UPDATE compliance_rules
SET resource_types = ARRAY['linode']
WHERE condition_type = 'firewall_rules_check'
  AND is_builtin = true;
