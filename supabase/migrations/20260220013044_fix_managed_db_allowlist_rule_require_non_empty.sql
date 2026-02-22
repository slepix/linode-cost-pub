/*
  # Fix "Managed DB check for 0.0.0.0/0" rule config

  ## Problem
  The rule had require_non_empty=true, causing an empty allow list to be
  flagged as a violation. An empty allow list means no IPs are permitted,
  which is actually the most restrictive (and compliant) state.

  ## Fix
  Set require_non_empty=false so the rule only flags when 0.0.0.0/0 or
  ::/0 is explicitly present in the allow list.
*/

UPDATE compliance_rules
SET condition_config = '{"forbidden_cidrs": ["0.0.0.0/0", "::/0"], "require_non_empty": false}'
WHERE name = 'Managed DB check for 0.0.0.0/0'
  AND condition_type = 'db_allowlist_check';
