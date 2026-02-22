/*
  # Add LKE Control Plane ACL Builtin Compliance Rule

  ## Summary
  Seeds a new builtin compliance rule that checks whether LKE cluster control
  planes have an Access Control List (ACL) configured and that the ACL does not
  allow unrestricted access (0.0.0.0/0 or ::/0).

  ## New Builtin Rule

  ### lke_control_plane_acl
  - Name: "LKE Control Plane ACL Configured"
  - Resource Type: lke_cluster
  - Condition Type: lke_control_plane_acl
  - Severity: critical
  - Checks that:
    1. The cluster supports control plane ACL (400 error = not supported → not_applicable)
    2. ACL is enabled
    3. No entry in ipv4 or ipv6 address lists is 0.0.0.0/0 or ::/0

  ## Notes
  - Uses a DO block for idempotent insertion
  - account_id IS NULL means this is a global builtin (applies to all accounts)
  - condition_type = 'lke_control_plane_acl' is evaluated via live Linode API call
    during compliance evaluation (not from cached specs)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM compliance_rules
    WHERE condition_type = 'lke_control_plane_acl'
      AND account_id IS NULL
      AND is_builtin = true
  ) THEN
    INSERT INTO compliance_rules (
      name,
      description,
      resource_types,
      condition_type,
      condition_config,
      severity,
      is_active,
      is_builtin,
      account_id
    ) VALUES (
      'LKE Control Plane ACL Configured',
      'Verifies that the LKE cluster control plane has an Access Control List (ACL) enabled and does not allow unrestricted access from 0.0.0.0/0 or ::/0. Unrestricted control plane access exposes the Kubernetes API server to the public internet.',
      ARRAY['lke_cluster'],
      'lke_control_plane_acl',
      '{}'::jsonb,
      'critical',
      true,
      true,
      NULL
    );
  END IF;
END $$;
