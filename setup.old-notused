-- =============================================================================
-- CloudWatch for Linode — Complete Database Setup
-- =============================================================================
-- Run this file once against a fresh PostgreSQL database via PostgREST.
-- Requirements:
--   - PostgreSQL 14+
--   - The pgcrypto extension must be available (ships with standard Postgres)
--   - The anon and authenticated roles must exist (created by PostgREST)
--   - Set app.settings.jwt_secret to your PostgREST JWT secret before running:
--       ALTER DATABASE yourdb SET app.settings.jwt_secret = 'your-secret-here';
--     Or pass it at runtime:
--       SET app.settings.jwt_secret = 'your-secret-here';
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- ROLES (create if they don't exist — PostgREST creates these automatically,
-- but included here for completeness when running against a bare Postgres)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;


-- =============================================================================
-- PRIVATE SCHEMA (for internal helper functions)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS private;


-- =============================================================================
-- TABLES
-- =============================================================================

-- linode_accounts
CREATE TABLE IF NOT EXISTS linode_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  api_token       text NOT NULL,
  webhook_api_key text,
  last_sync_at    timestamptz,
  last_evaluated_at timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE linode_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to linode_accounts"
  ON linode_accounts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- resources
CREATE TABLE IF NOT EXISTS resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid REFERENCES linode_accounts(id) ON DELETE CASCADE NOT NULL,
  resource_id         text NOT NULL,
  resource_type       text NOT NULL,
  label               text,
  region              text,
  status              text,
  specs               jsonb,
  pricing             jsonb,
  plan_type           text,
  monthly_cost        numeric DEFAULT 0,
  resource_created_at timestamptz,
  last_synced_at      timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_account_id    ON resources(account_id);
CREATE INDEX IF NOT EXISTS idx_resources_resource_type ON resources(resource_type);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to resources"
  ON resources FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- recommendations
CREATE TABLE IF NOT EXISTS recommendations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id           uuid REFERENCES resources(id) ON DELETE CASCADE,
  recommendation_type   text,
  current_plan          text,
  suggested_plan        text,
  reasoning             text,
  estimated_savings     numeric,
  estimated_cost_increase numeric,
  confidence_score      numeric,
  metrics_summary       jsonb,
  status                text DEFAULT 'active',
  title                 text,
  description           text,
  potential_savings     numeric DEFAULT 0,
  note                  text,
  dismissed_at          timestamptz,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to recommendations"
  ON recommendations FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- budget_alerts
CREATE TABLE IF NOT EXISTS budget_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid REFERENCES linode_accounts(id) ON DELETE CASCADE,
  name            text DEFAULT 'Default Budget',
  budget_amount   numeric,
  monthly_limit   numeric,
  alert_threshold numeric,
  period          text,
  is_active       boolean DEFAULT true,
  last_alert_sent timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view budgets"
  ON budget_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert budgets"
  ON budget_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update budgets"
  ON budget_alerts FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete budgets"
  ON budget_alerts FOR DELETE
  TO anon, authenticated
  USING (true);

-- metrics_history
CREATE TABLE IF NOT EXISTS metrics_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid REFERENCES resources(id) ON DELETE CASCADE,
  metric_type text,
  value       numeric,
  unit        text,
  timestamp   timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metrics_history_resource_id ON metrics_history(resource_id);

ALTER TABLE metrics_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to metrics_history"
  ON metrics_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ai_config
CREATE TABLE IF NOT EXISTS ai_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_endpoint    text,
  api_key         text,
  model_name      text,
  savings_profile text NOT NULL DEFAULT 'balanced',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ai_config"
  ON ai_config FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- cost_summary
CREATE TABLE IF NOT EXISTS cost_summary (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid REFERENCES linode_accounts(id) ON DELETE CASCADE NOT NULL,
  cost_date          date NOT NULL,
  total_cost         numeric NOT NULL,
  resource_breakdown jsonb DEFAULT '{}',
  created_at         timestamptz DEFAULT now(),
  UNIQUE(account_id, cost_date)
);

CREATE INDEX IF NOT EXISTS idx_cost_summary_account_date ON cost_summary(account_id, cost_date DESC);

ALTER TABLE cost_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cost_summary"
  ON cost_summary FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- cost_history
CREATE TABLE IF NOT EXISTS cost_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid REFERENCES linode_accounts(id) ON DELETE CASCADE,
  resource_id  uuid REFERENCES resources(id) ON DELETE CASCADE,
  amount       numeric,
  period_start timestamptz,
  period_end   timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cost_history"
  ON cost_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- linode_types_cache
CREATE TABLE IF NOT EXISTS linode_types_cache (
  id            text PRIMARY KEY,
  label         text,
  class         text,
  vcpus         integer,
  memory        integer,
  disk          integer,
  network_out   integer,
  transfer      integer,
  price_monthly numeric,
  price_hourly  numeric,
  gpus          integer,
  successor     text,
  fetched_at    timestamptz
);

ALTER TABLE linode_types_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read linode types cache"
  ON linode_types_cache FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert linode types cache"
  ON linode_types_cache FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update linode types cache"
  ON linode_types_cache FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete linode types cache"
  ON linode_types_cache FOR DELETE
  TO anon, authenticated
  USING (true);

-- profile_prompts
CREATE TABLE IF NOT EXISTS profile_prompts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile    text UNIQUE NOT NULL,
  prompt     text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profile_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select on profile_prompts"
  ON profile_prompts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert on profile_prompts"
  ON profile_prompts FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update on profile_prompts"
  ON profile_prompts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- resource_snapshots
CREATE TABLE IF NOT EXISTS resource_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id   uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  label         text NOT NULL,
  region        text,
  plan_type     text,
  monthly_cost  numeric DEFAULT 0,
  status        text,
  specs         jsonb,
  diff          jsonb,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_snapshots_resource_id ON resource_snapshots(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_account_id  ON resource_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_synced_at   ON resource_snapshots(synced_at DESC);

ALTER TABLE resource_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select resource_snapshots"
  ON resource_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert resource_snapshots"
  ON resource_snapshots FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update resource_snapshots"
  ON resource_snapshots FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete resource_snapshots"
  ON resource_snapshots FOR DELETE
  TO anon, authenticated
  USING (true);

-- compliance_rules
CREATE TABLE IF NOT EXISTS compliance_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid REFERENCES linode_accounts(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  resource_types text[] NOT NULL DEFAULT '{}',
  condition_type text NOT NULL,
  condition_config jsonb DEFAULT '{}',
  severity       text NOT NULL DEFAULT 'warning',
  is_active      boolean NOT NULL DEFAULT true,
  is_builtin     boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_account_id ON compliance_rules(account_id);

ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select compliance_rules"
  ON compliance_rules FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert compliance_rules"
  ON compliance_rules FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update compliance_rules"
  ON compliance_rules FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete compliance_rules"
  ON compliance_rules FOR DELETE
  TO anon, authenticated
  USING (true);

-- compliance_profiles
CREATE TABLE IF NOT EXISTS compliance_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text UNIQUE NOT NULL,
  description          text,
  tier                 text,
  is_builtin           boolean DEFAULT false,
  version              text,
  icon                 text,
  rule_condition_types text[] DEFAULT '{}',
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE compliance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select compliance_profiles"
  ON compliance_profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert compliance_profiles"
  ON compliance_profiles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update compliance_profiles"
  ON compliance_profiles FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete compliance_profiles"
  ON compliance_profiles FOR DELETE
  TO anon, authenticated
  USING (true);

-- compliance_results
CREATE TABLE IF NOT EXISTS compliance_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  resource_id       uuid REFERENCES resources(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'not_applicable',
  detail            text,
  acknowledged      boolean NOT NULL DEFAULT false,
  acknowledged_at   timestamptz,
  acknowledged_note text,
  acknowledged_by   uuid,
  evaluated_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_results_rule_id     ON compliance_results(rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_resource_id ON compliance_results(resource_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_account_id  ON compliance_results(account_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_status      ON compliance_results(status);
CREATE INDEX IF NOT EXISTS idx_compliance_results_acknowledged ON compliance_results(acknowledged);

ALTER TABLE compliance_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select compliance_results"
  ON compliance_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert compliance_results"
  ON compliance_results FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update compliance_results"
  ON compliance_results FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete compliance_results"
  ON compliance_results FOR DELETE
  TO anon, authenticated
  USING (true);

-- resource_relationships
CREATE TABLE IF NOT EXISTS resource_relationships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  source_id         uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  target_id         uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  metadata          jsonb,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_relationships_account_id ON resource_relationships(account_id);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_source_id  ON resource_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_resource_relationships_target_id  ON resource_relationships(target_id);

ALTER TABLE resource_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select resource_relationships"
  ON resource_relationships FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert resource_relationships"
  ON resource_relationships FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update resource_relationships"
  ON resource_relationships FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete resource_relationships"
  ON resource_relationships FOR DELETE
  TO anon, authenticated
  USING (true);

-- linode_events
CREATE TABLE IF NOT EXISTS linode_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  event_id              bigint NOT NULL,
  action                text NOT NULL,
  entity_id             text,
  entity_type           text,
  entity_label          text,
  entity_url            text,
  secondary_entity_id   text,
  secondary_entity_type text,
  secondary_entity_label text,
  message               text,
  status                text,
  username              text,
  duration              numeric,
  percent_complete      integer,
  seen                  boolean DEFAULT false,
  event_created         timestamptz,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(account_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_linode_events_account_id   ON linode_events(account_id);
CREATE INDEX IF NOT EXISTS idx_linode_events_event_created ON linode_events(event_created DESC);
CREATE INDEX IF NOT EXISTS idx_linode_events_entity_type  ON linode_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_linode_events_action       ON linode_events(action);

ALTER TABLE linode_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select linode_events"
  ON linode_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert linode_events"
  ON linode_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update linode_events"
  ON linode_events FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete linode_events"
  ON linode_events FOR DELETE
  TO anon, authenticated
  USING (true);

-- compliance_score_history
CREATE TABLE IF NOT EXISTS compliance_score_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  evaluated_at          timestamptz NOT NULL DEFAULT now(),
  total_results         integer NOT NULL DEFAULT 0,
  compliant_count       integer NOT NULL DEFAULT 0,
  non_compliant_count   integer NOT NULL DEFAULT 0,
  not_applicable_count  integer NOT NULL DEFAULT 0,
  acknowledged_count    integer NOT NULL DEFAULT 0,
  compliance_score      numeric(5,2),
  total_rules_evaluated integer NOT NULL DEFAULT 0,
  rule_breakdown        jsonb DEFAULT '[]'::jsonb,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_id         ON compliance_score_history(account_id);
CREATE INDEX IF NOT EXISTS idx_compliance_score_history_evaluated_at        ON compliance_score_history(evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_evaluated   ON compliance_score_history(account_id, evaluated_at DESC);

ALTER TABLE compliance_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read score history"
  ON compliance_score_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can insert score history"
  ON compliance_score_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- account_rule_overrides
CREATE TABLE IF NOT EXISTS account_rule_overrides (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  rule_id              uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  is_active            boolean NOT NULL DEFAULT true,
  applied_by_profile_id uuid REFERENCES compliance_profiles(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (account_id, rule_id)
);

ALTER TABLE account_rule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select account_rule_overrides"
  ON account_rule_overrides FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert account_rule_overrides"
  ON account_rule_overrides FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update account_rule_overrides"
  ON account_rule_overrides FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete account_rule_overrides"
  ON account_rule_overrides FOR DELETE
  TO anon, authenticated
  USING (true);

-- account_compliance_profiles
CREATE TABLE IF NOT EXISTS account_compliance_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES compliance_profiles(id) ON DELETE CASCADE,
  activated_at timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE account_compliance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can access account_compliance_profiles"
  ON account_compliance_profiles FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- resource_compliance_history
CREATE TABLE IF NOT EXISTS resource_compliance_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  results      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rch_resource_id  ON resource_compliance_history(resource_id);
CREATE INDEX IF NOT EXISTS idx_rch_account_id   ON resource_compliance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_rch_evaluated_at ON resource_compliance_history(evaluated_at DESC);

ALTER TABLE resource_compliance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert resource compliance history"
  ON resource_compliance_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read resource compliance history"
  ON resource_compliance_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can insert resource compliance history"
  ON resource_compliance_history FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can read resource compliance history"
  ON resource_compliance_history FOR SELECT
  TO anon
  USING (true);

-- org_users
-- NOTE: In the self-hosted version, org_users does NOT reference auth.users.
--       Instead, it stores its own password_hash for bcrypt authentication.
CREATE TABLE IF NOT EXISTS org_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  full_name       text NOT NULL DEFAULT '',
  role            text NOT NULL DEFAULT 'auditor'
    CHECK (role IN ('admin', 'power_user', 'auditor')),
  is_active       boolean NOT NULL DEFAULT true,
  password_hash   text,
  can_view_costs      boolean NOT NULL DEFAULT true,
  can_view_compliance boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_users ENABLE ROW LEVEL SECURITY;

-- user_account_access
CREATE TABLE IF NOT EXISTS user_account_access (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  granted_by       uuid REFERENCES org_users(id),
  granted_at       timestamptz NOT NULL DEFAULT now(),
  can_view_costs      boolean NOT NULL DEFAULT true,
  can_view_compliance boolean NOT NULL DEFAULT true,
  UNIQUE(user_id, account_id)
);

ALTER TABLE user_account_access ENABLE ROW LEVEL SECURITY;

-- compliance_result_notes
CREATE TABLE IF NOT EXISTS compliance_result_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_result_id  uuid NOT NULL REFERENCES compliance_results(id) ON DELETE CASCADE,
  account_id            uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  note                  text NOT NULL,
  created_by            uuid REFERENCES org_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_result_id  ON compliance_result_notes(compliance_result_id);
CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_account_id ON compliance_result_notes(account_id);

ALTER TABLE compliance_result_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view compliance result notes"
  ON compliance_result_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert compliance result notes"
  ON compliance_result_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete their own compliance result notes"
  ON compliance_result_notes FOR DELETE
  TO authenticated
  USING (
    created_by IS NULL
    OR EXISTS (
      SELECT 1 FROM org_users
      WHERE org_users.id = compliance_result_notes.created_by
        AND org_users.id = (
          SELECT id FROM org_users WHERE email = current_setting('request.jwt.claims', true)::jsonb->>'email' LIMIT 1
        )
    )
  );


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Returns current user's org role from JWT claim
CREATE OR REPLACE FUNCTION current_user_org_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM org_users
  WHERE email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    AND is_active = true
  LIMIT 1;
$$;

-- Returns true if the current JWT user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_users
    WHERE email = current_setting('request.jwt.claims', true)::jsonb->>'email'
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- Returns true when no users have registered yet (controls registration UI)
CREATE OR REPLACE FUNCTION public.registration_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.org_users LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_open() TO anon;
GRANT EXECUTE ON FUNCTION public.registration_open() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_open() TO service_role;


-- =============================================================================
-- ORG USERS RLS POLICIES
-- (after helper functions are defined)
-- =============================================================================

CREATE POLICY "Users can view own profile or admins view all"
  ON org_users FOR SELECT
  TO authenticated
  USING (
    email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    OR is_admin()
  );

CREATE POLICY "Admins can insert users"
  ON org_users FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Users can update own profile or admins update all"
  ON org_users FOR UPDATE
  TO authenticated
  USING (
    email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    OR is_admin()
  )
  WITH CHECK (
    email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    OR is_admin()
  );

CREATE POLICY "Admins can delete non-self users"
  ON org_users FOR DELETE
  TO authenticated
  USING (
    is_admin()
    AND email <> current_setting('request.jwt.claims', true)::jsonb->>'email'
  );

-- Allow anon to call registration_open() which reads org_users via SECURITY DEFINER
-- No direct anon SELECT on org_users


-- =============================================================================
-- USER ACCOUNT ACCESS RLS POLICIES
-- =============================================================================

CREATE POLICY "Users can view own account grants or admins view all"
  ON user_account_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_users
      WHERE org_users.email = current_setting('request.jwt.claims', true)::jsonb->>'email'
        AND org_users.id = user_account_access.user_id
    )
    OR is_admin()
  );

CREATE POLICY "Admins can grant access"
  ON user_account_access FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update access flags"
  ON user_account_access FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can revoke access"
  ON user_account_access FOR DELETE
  TO authenticated
  USING (is_admin());


-- =============================================================================
-- JWT + AUTH FUNCTIONS
-- =============================================================================

-- Internal JWT signing helper
CREATE OR REPLACE FUNCTION private.sign_jwt(payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  secret        text;
  header_b64    text;
  payload_b64   text;
  signing_input text;
  sig           text;
BEGIN
  secret := current_setting('app.settings.jwt_secret', true);
  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'JWT secret not configured. Run: ALTER DATABASE yourdb SET app.settings.jwt_secret = ''your-secret'';';
  END IF;

  header_b64 := replace(replace(
    encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  header_b64 := rtrim(header_b64, E'\n=');

  payload_b64 := replace(replace(
    encode(convert_to(payload::text, 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  payload_b64 := rtrim(payload_b64, E'\n=');

  signing_input := header_b64 || '.' || payload_b64;

  sig := replace(replace(
    encode(extensions.hmac(signing_input, secret, 'sha256'), 'base64'),
    '+', '-'), '/', '_');
  sig := rtrim(sig, E'\n=');

  RETURN signing_input || '.' || sig;
END;
$$;

-- Registration RPC
-- Parameters are alphabetical to match PostgREST named-parameter resolution
CREATE OR REPLACE FUNCTION public.auth_register(
  p_email    text,
  p_fullname text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  v_id      uuid;
  v_role    text := 'admin';
  v_hash    text;
  v_token   text;
  v_exp     bigint;
  v_payload jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM org_users LIMIT 1) THEN
    RAISE EXCEPTION 'registration_closed';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF EXISTS (SELECT 1 FROM org_users WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  v_hash := crypt(p_password, gen_salt('bf', 10));
  v_id   := gen_random_uuid();
  v_exp  := extract(epoch from now() + interval '8 hours')::bigint;

  INSERT INTO org_users (id, email, full_name, role, is_active, password_hash)
  VALUES (v_id, lower(p_email), p_fullname, v_role, true, v_hash);

  v_payload := jsonb_build_object(
    'role',      'authenticated',
    'sub',       v_id::text,
    'email',     lower(p_email),
    'user_role', v_role,
    'iat',       extract(epoch from now())::bigint,
    'exp',       v_exp
  );

  v_token := private.sign_jwt(v_payload);

  RETURN jsonb_build_object(
    'token',     v_token,
    'user_id',   v_id,
    'role',      v_role,
    'full_name', p_fullname,
    'email',     lower(p_email)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_register(text, text, text) TO anon;

-- Login RPC
CREATE OR REPLACE FUNCTION public.auth_login(
  p_email    text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  v_row     org_users%ROWTYPE;
  v_token   text;
  v_exp     bigint;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_row FROM org_users WHERE email = lower(p_email) AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF v_row.password_hash IS NULL OR v_row.password_hash = '' THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF crypt(p_password, v_row.password_hash) <> v_row.password_hash THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  v_exp := extract(epoch from now() + interval '8 hours')::bigint;

  v_payload := jsonb_build_object(
    'role',      'authenticated',
    'sub',       v_row.id::text,
    'email',     v_row.email,
    'user_role', v_row.role,
    'iat',       extract(epoch from now())::bigint,
    'exp',       v_exp
  );

  v_token := private.sign_jwt(v_payload);

  RETURN jsonb_build_object(
    'token',     v_token,
    'user_id',   v_row.id,
    'role',      v_row.role,
    'full_name', v_row.full_name,
    'email',     v_row.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_login(text, text) TO anon;


-- =============================================================================
-- SEED DATA: BUILT-IN COMPLIANCE RULES
-- =============================================================================

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_active, is_builtin, account_id)
VALUES
  (
    'Linodes must have a firewall',
    'Every Linode instance should be protected by at least one active firewall.',
    ARRAY['linode'], 'firewall_attached', '{}', 'critical', true, true, NULL
  ),
  (
    'No unrestricted inbound traffic',
    'Firewall rules should not allow unrestricted inbound access (0.0.0.0/0 or ::/0) on sensitive ports.',
    ARRAY['firewall'], 'no_open_inbound', '{"sensitive_ports": [22, 3389, 3306, 5432, 6379, 27017]}', 'critical', true, true, NULL
  ),
  (
    'Firewall must be attached',
    'A firewall that is not attached to any Linode provides no value.',
    ARRAY['firewall'], 'firewall_has_targets', '{}', 'info', true, true, NULL
  ),
  (
    'LKE clusters should have multiple nodes',
    'Kubernetes clusters should have more than one node for high availability.',
    ARRAY['lke_cluster'], 'min_node_count', '{"min_count": 2}', 'warning', true, true, NULL
  ),
  (
    'Resources should have tags',
    'Resources must have owner, environment, and cost-center tags (format: key:value) for accountability, automation, and cost tracking.',
    ARRAY['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database'],
    'has_tags',
    '{"required_tags": [{"key": "owner", "value": "*"}, {"key": "environment", "value": "*"}, {"key": "cost-center", "value": "*"}]}',
    'info', true, true, NULL
  ),
  (
    'Volumes should be attached',
    'Unattached volumes still incur cost but provide no value.',
    ARRAY['volume'], 'volume_attached', '{}', 'info', true, true, NULL
  ),
  (
    'No unrestricted database access',
    'Managed databases should not have 0.0.0.0/0 or ::/0 in their IP allow list, as this exposes the database endpoint to the public internet.',
    ARRAY['database'], 'db_allowlist_check', '{"forbidden_cidrs": ["0.0.0.0/0", "::/0"], "require_non_empty": false}', 'critical', true, true, NULL
  ),
  (
    'Databases must not have public access enabled',
    'Managed databases with public_access enabled in their VPC private network configuration are reachable from outside the VPC, which increases the attack surface.',
    ARRAY['database'], 'db_public_access', '{"allow_public_access": false}', 'critical', true, true, NULL
  ),
  (
    'Linode Backups Enabled',
    'Verifies that automated backups are enabled for every Linode instance. Backups protect against accidental data loss.',
    ARRAY['linode'], 'linode_backups_enabled', '{}', 'critical', true, true, NULL
  ),
  (
    'Linode Disk Encryption Enabled',
    'Verifies that disk encryption is enabled on every Linode instance. Encryption protects data at rest.',
    ARRAY['linode'], 'linode_disk_encryption', '{}', 'critical', true, true, NULL
  ),
  (
    'Linode Deletion Lock Configured',
    'Verifies that at least one deletion lock (cannot_delete or cannot_delete_with_subresources) is configured to protect the instance from accidental deletion.',
    ARRAY['linode'], 'linode_lock_configured', '{"required_lock_types": []}', 'warning', true, true, NULL
  ),
  (
    'Linode Instance Not Offline',
    'Flags any Linode instance that is currently in an offline state. Offline instances may indicate a misconfiguration, failure, or unintended shutdown.',
    ARRAY['linode'], 'linode_not_offline', '{}', 'warning', true, true, NULL
  ),
  (
    'All Linodes must have a recent successful backup',
    'Verifies that a successful backup has actually occurred within the last 7 days by checking the last_successful backup timestamp — not just whether backups are configured. Linodes with no backup or an outdated backup will be flagged.',
    ARRAY['linode'], 'linode_backup_recency', '{"max_age_days": 7}', 'warning', true, true, NULL
  ),
  (
    'LKE Control Plane ACL Configured',
    'Verifies that the LKE cluster control plane has an Access Control List (ACL) enabled and does not allow unrestricted access from 0.0.0.0/0 or ::/0. Unrestricted control plane access exposes the Kubernetes API server to the public internet.',
    ARRAY['lke_cluster'], 'lke_control_plane_acl', '{}', 'critical', true, true, NULL
  ),
  (
    'LKE Control Plane High Availability',
    'LKE cluster control plane high availability must be enabled for production resilience.',
    ARRAY['lke_cluster'], 'lke_control_plane_ha', '{}', 'warning', true, true, NULL
  ),
  (
    'LKE Audit Logs Enabled',
    'LKE control plane audit logging must be enabled to record API server activity.',
    ARRAY['lke_cluster'], 'lke_audit_logs_enabled', '{}', 'warning', true, true, NULL
  ),
  (
    'Object Storage Bucket ACL',
    'Object storage bucket ACL must not allow public-read, public-read-write, or authenticated-read access.',
    ARRAY['bucket'], 'bucket_acl_check', '{"required_acl": "", "forbidden_acls": ["public-read", "public-read-write", "authenticated-read"]}', 'critical', true, true, NULL
  ),
  (
    'Volume Encryption Enabled',
    'Block storage volumes must have disk encryption enabled to protect data at rest.',
    ARRAY['volume'], 'volume_encryption_enabled', '{}', 'critical', true, true, NULL
  ),
  (
    'All Users Must Have TFA Enabled',
    'Every user on the account (excluding proxy/service users) must have two-factor authentication enabled.',
    ARRAY[]::text[], 'tfa_users', '{}', 'critical', true, true, NULL
  ),
  (
    'Account Login IP Restriction',
    'Account logins must only be permitted from a configured IP allow list to prevent unauthorized access.',
    ARRAY[]::text[], 'login_allowed_ips', '{}', 'warning', true, true, NULL
  ),
  (
    'Resources in Approved Regions',
    'All resources must be deployed only in approved geographic regions for compliance and data sovereignty.',
    ARRAY['linode', 'volume', 'lke_cluster', 'database', 'nodebalancer', 'bucket'],
    'approved_regions', '{"approved_regions": []}', 'warning', true, true, NULL
  ),
  (
    'Firewall Policy Requirements',
    'Firewall inbound and outbound policies must meet configurable security requirements.',
    ARRAY['linode'], 'firewall_rules_check',
    '{"required_inbound_policy": "DROP", "required_outbound_policy": "", "blocked_ports": [], "allowed_source_ips": [], "require_no_open_ports": false}',
    'warning', true, true, NULL
  ),
  (
    'NodeBalancer Protocol Check',
    'NodeBalancer ports must use only HTTPS protocol; plain HTTP endpoints are not permitted.',
    ARRAY['nodebalancer'], 'nodebalancer_protocol_check', '{"allowed_protocols": ["https"]}', 'warning', true, true, NULL
  ),
  (
    'NodeBalancer Allowed Ports',
    'NodeBalancer must only listen on approved ports (default: 443). Any other port must be explicitly whitelisted.',
    ARRAY['nodebalancer'], 'nodebalancer_port_allowlist', '{"allowed_ports": [443]}', 'warning', true, true, NULL
  ),
  (
    'Firewall rules must not allow all ports',
    'Detects inbound or outbound firewall rules that allow traffic on all ports — either through a protocol of ALL, an empty port range, or the full range 1-65535. Such rules are overly permissive and should be replaced with specific port allowances.',
    ARRAY['firewall'], 'firewall_all_ports_allowed', '{"check_inbound": true, "check_outbound": false, "actions": ["ACCEPT"]}', 'warning', true, true, NULL
  ),
  (
    'Every firewall rule must have a description',
    'Checks that all inbound and outbound firewall rules have a non-empty description set. Descriptions help document the purpose of each rule, making it easier to audit and review firewall configurations.',
    ARRAY['firewall'], 'firewall_rule_descriptions', '{}', 'info', true, true, NULL
  )
ON CONFLICT DO NOTHING;


-- =============================================================================
-- SEED DATA: BUILT-IN COMPLIANCE PROFILES
-- =============================================================================

INSERT INTO compliance_profiles (name, slug, description, tier, version, icon, rule_condition_types, is_builtin)
VALUES
  (
    'Level 1 — Foundation',
    'cis-l1',
    'Core security controls for all production infrastructure. Covers the most critical risks with minimal operational overhead. Suitable as a baseline for all accounts.',
    'foundation',
    '1.0',
    'shield',
    ARRAY['firewall_attached','no_open_inbound','linode_backups_enabled','db_allowlist_check','db_public_access','tfa_users','has_tags','volume_attached','lke_control_plane_acl'],
    true
  ),
  (
    'Level 2 — Standard',
    'cis-l2',
    'Comprehensive controls for production workloads with moderate compliance requirements. Extends Level 1 with encryption, backup verification, HA requirements, and access control checks.',
    'standard',
    '1.0',
    'shield-check',
    ARRAY['firewall_attached','firewall_rules_check','firewall_has_targets','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','has_tags','approved_regions','min_node_count','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check'],
    true
  ),
  (
    'Strict — Zero Trust',
    'strict-zt',
    'Maximum security posture for high-risk or regulated environments. Every control is enforced. Intended for financial services, healthcare, or government workloads where no risk tolerance is acceptable.',
    'strict',
    '1.0',
    'lock',
    ARRAY['firewall_attached','firewall_rules_check','firewall_has_targets','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','linode_not_offline','volume_encryption_enabled','volume_attached','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','has_tags','approved_regions','min_node_count','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check','nodebalancer_protocol_check','nodebalancer_port_allowlist'],
    true
  ),
  (
    'SOC 2 Readiness',
    'soc2',
    'Maps controls to the SOC 2 Trust Service Criteria — Security (CC6/CC7), Availability (A1), and Confidentiality (C1). Designed to support audit readiness for Type I and Type II assessments.',
    'standard',
    '1.0',
    'file-check',
    ARRAY['firewall_attached','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','lke_audit_logs_enabled','lke_control_plane_acl','bucket_acl_check','has_tags'],
    true
  ),
  (
    'PCI-DSS Baseline',
    'pci-dss',
    'Subset of controls aligned to PCI DSS v4.0 Requirements 1 (Network Security), 2 (Secure Configs), 3 (Data Protection), 7 (Access Control), and 10 (Audit Logging). Intended as a starting point — a full PCI assessment requires additional controls.',
    'strict',
    '1.0',
    'credit-card',
    ARRAY['firewall_attached','firewall_rules_check','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','approved_regions','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check','nodebalancer_protocol_check','nodebalancer_port_allowlist'],
    true
  ),
  (
    'Minimal / Dev',
    'minimal-dev',
    'Lightweight profile for development and staging accounts. Only critical blocking issues are flagged — avoids noise on non-production infrastructure where strict controls are impractical. Not suitable for production.',
    'foundation',
    '1.0',
    'wrench',
    ARRAY['firewall_attached','no_open_inbound','db_allowlist_check','db_public_access','tfa_users'],
    true
  ),
  (
    'All Rules',
    'all-rules',
    'Enables every available compliance rule. Use this to get full visibility across all checks — useful for auditing, onboarding, or building a custom baseline.',
    'strict',
    'v1.0',
    'shield-check',
    ARRAY['approved_regions','bucket_acl_check','db_allowlist_check','db_public_access','firewall_attached','firewall_has_targets','firewall_rules_check','has_tags','linode_backup_recency','linode_backups_enabled','linode_disk_encryption','linode_lock_configured','linode_not_offline','lke_audit_logs_enabled','lke_control_plane_acl','lke_control_plane_ha','login_allowed_ips','min_node_count','no_open_inbound','nodebalancer_port_allowlist','nodebalancer_protocol_check','tfa_users','volume_attached','volume_encryption_enabled'],
    true
  )
ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- GRANT TABLE ACCESS TO ROLES
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
