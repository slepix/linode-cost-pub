/*
  # Fix All Rules profile — add firewall_all_ports_allowed

  The "All Rules" profile was seeded before the firewall_all_ports_allowed rule was
  added. Update its rule_condition_types to include it so the profile accurately
  reflects all 29 built-in rules.
*/

UPDATE compliance_profiles
SET
  rule_condition_types = array_append(rule_condition_types, 'firewall_all_ports_allowed'),
  updated_at = now()
WHERE name = 'All Rules'
  AND NOT ('firewall_all_ports_allowed' = ANY(rule_condition_types));
