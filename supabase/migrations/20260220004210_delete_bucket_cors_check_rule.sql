/*
  # Delete bucket_cors_check built-in rule

  Removes the "Object Storage Bucket CORS" built-in compliance rule (bucket_cors_check)
  as it duplicates the existing Object Storage Bucket CORS configuration rule.

  1. Deletes any compliance results tied to this rule
  2. Deletes any account rule overrides referencing this rule
  3. Removes the condition type from all compliance profiles' rule_condition_types arrays
  4. Deletes the rule itself
*/

DELETE FROM compliance_results
WHERE rule_id IN (
  SELECT id FROM compliance_rules WHERE condition_type = 'bucket_cors_check'
);

DELETE FROM account_rule_overrides
WHERE rule_id IN (
  SELECT id FROM compliance_rules WHERE condition_type = 'bucket_cors_check'
);

UPDATE compliance_profiles
SET rule_condition_types = array_remove(rule_condition_types, 'bucket_cors_check');

DELETE FROM compliance_rules
WHERE condition_type = 'bucket_cors_check';
