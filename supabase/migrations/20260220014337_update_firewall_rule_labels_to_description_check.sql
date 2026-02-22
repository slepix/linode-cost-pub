/*
  # Update firewall rule label check to description check

  ## Summary
  The "Every firewall rule must have a label" rule was effectively useless because
  Linode enforces labels as mandatory on all firewall rules, meaning the check
  would always pass. This migration repurposes the rule to check for descriptions
  instead, which are optional in Linode and provide meaningful audit value.

  ## Changes
  - Updates the rule name, description, and condition_type to target descriptions
    instead of labels
  - condition_type changes from firewall_rule_labels to firewall_rule_descriptions
*/

UPDATE compliance_rules
SET
  name = 'Every firewall rule must have a description',
  description = 'Checks that all inbound and outbound firewall rules have a non-empty description set. Descriptions help document the purpose of each rule, making it easier to audit and review firewall configurations and reducing the risk of accidental misconfigurations going unnoticed.',
  condition_type = 'firewall_rule_descriptions'
WHERE condition_type = 'firewall_rule_labels';
