/*
  # Fix object storage resource type mismatch in compliance rules

  ## Problem
  Compliance rules for object storage buckets referenced resource_type 'bucket',
  but resources are synced and stored with resource_type 'object_storage'.
  This caused the rule filter to never match, so bucket rules were never evaluated.

  ## Changes
  - Update resource_types array in all compliance rules: replace 'bucket' with 'object_storage'
  - Affected rules: bucket_acl_check, bucket_cors_check, approved_regions
*/

UPDATE compliance_rules
SET resource_types = array_replace(resource_types, 'bucket', 'object_storage')
WHERE 'bucket' = ANY(resource_types);
