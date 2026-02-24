-- =============================================================================
-- LCCM (Linode Cloud Compliance Manager) - Complete Database Schema
-- =============================================================================
-- Run this against a fresh PostgreSQL 14+ database to set up the full schema,
-- roles, functions, and seed data needed to run the application.
--
-- Usage:
--   psql -U postgres -d yourdb -f schema.sql
--
-- Prerequisites:
--   1. Create a database:  CREATE DATABASE lccm;
--   2. Create an app user: CREATE USER lccm_app WITH PASSWORD 'changeme';
--   3. Set JWT secret:     ALTER DATABASE lccm SET app.settings.jwt_secret = 'your-secret-min-32-chars';
--
-- After running this file, configure PostgREST with:
--   db-uri         = "postgres://lccm_app:changeme@localhost:5432/lccm"
--   db-schema      = "public"
--   db-anon-role   = "anon"
--   jwt-secret     = "your-secret-min-32-chars"  (must match above)
--   jwt-aud        = ""
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ---------------------------------------------------------------------------
-- Roles (PostgREST uses these to switch DB roles per request)
-- ---------------------------------------------------------------------------
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

-- Grant the app user the ability to switch to these roles
DO $$
DECLARE
  app_user text := current_user;
BEGIN
  EXECUTE format('GRANT anon, authenticated, service_role TO %I', app_user);
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- JWT signing (private schema)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

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
    encode(hmac(signing_input, secret, 'sha256'), 'base64'),
    '+', '-'), '/', '_');
  sig := rtrim(sig, E'\n=');

  RETURN signing_input || '.' || sig;
END;
$$;


-- ---------------------------------------------------------------------------
-- Core Application Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS linode_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  api_token         text NOT NULL,
  webhook_api_key   text,
  last_sync_at      timestamptz,
  last_evaluated_at timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE linode_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to linode_accounts"
  ON linode_accounts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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


CREATE TABLE IF NOT EXISTS recommendations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id             uuid REFERENCES resources(id) ON DELETE CASCADE,
  recommendation_type     text,
  current_plan            text,
  suggested_plan          text,
  reasoning               text,
  estimated_savings       numeric,
  estimated_cost_increase numeric,
  confidence_score        numeric,
  metrics_summary         jsonb,
  status                  text DEFAULT 'active',
  title                   text,
  description             text,
  potential_savings       numeric DEFAULT 0,
  note                    text,
  dismissed_at            timestamptz,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to recommendations"
  ON recommendations FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE POLICY "Allow all access to budget_alerts"
  ON budget_alerts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE POLICY "Allow all access to linode_types_cache"
  ON linode_types_cache FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


CREATE TABLE IF NOT EXISTS profile_prompts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile    text UNIQUE NOT NULL,
  prompt     text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profile_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to profile_prompts"
  ON profile_prompts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE POLICY "Allow all access to resource_snapshots"
  ON resource_snapshots FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- Compliance Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS compliance_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid REFERENCES linode_accounts(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  resource_types   text[] NOT NULL DEFAULT '{}',
  condition_type   text NOT NULL,
  condition_config jsonb DEFAULT '{}',
  severity         text NOT NULL DEFAULT 'warning',
  is_active        boolean NOT NULL DEFAULT true,
  is_builtin       boolean NOT NULL DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_account_id ON compliance_rules(account_id);

ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to compliance_rules"
  ON compliance_rules FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE POLICY "Allow all access to compliance_profiles"
  ON compliance_profiles FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE INDEX IF NOT EXISTS idx_compliance_results_rule_id      ON compliance_results(rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_resource_id  ON compliance_results(resource_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_account_id   ON compliance_results(account_id);
CREATE INDEX IF NOT EXISTS idx_compliance_results_status       ON compliance_results(status);
CREATE INDEX IF NOT EXISTS idx_compliance_results_acknowledged ON compliance_results(acknowledged);

ALTER TABLE compliance_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to compliance_results"
  ON compliance_results FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE POLICY "Allow all access to resource_relationships"
  ON resource_relationships FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


CREATE TABLE IF NOT EXISTS linode_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  event_id               bigint NOT NULL,
  action                 text NOT NULL,
  entity_id              text,
  entity_type            text,
  entity_label           text,
  entity_url             text,
  secondary_entity_id    text,
  secondary_entity_type  text,
  secondary_entity_label text,
  message                text,
  status                 text,
  username               text,
  duration               numeric,
  percent_complete       integer,
  seen                   boolean DEFAULT false,
  event_created          timestamptz,
  created_at             timestamptz DEFAULT now(),
  UNIQUE(account_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_linode_events_account_id    ON linode_events(account_id);
CREATE INDEX IF NOT EXISTS idx_linode_events_event_created ON linode_events(event_created DESC);
CREATE INDEX IF NOT EXISTS idx_linode_events_entity_type   ON linode_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_linode_events_action        ON linode_events(action);

ALTER TABLE linode_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to linode_events"
  ON linode_events FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


CREATE TABLE IF NOT EXISTS compliance_score_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  evaluated_at         timestamptz NOT NULL DEFAULT now(),
  total_results        integer NOT NULL DEFAULT 0,
  compliant_count      integer NOT NULL DEFAULT 0,
  non_compliant_count  integer NOT NULL DEFAULT 0,
  not_applicable_count integer NOT NULL DEFAULT 0,
  acknowledged_count   integer NOT NULL DEFAULT 0,
  compliance_score     numeric(5,2),
  total_rules_evaluated integer NOT NULL DEFAULT 0,
  rule_breakdown       jsonb DEFAULT '[]'::jsonb,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_id       ON compliance_score_history(account_id);
CREATE INDEX IF NOT EXISTS idx_compliance_score_history_evaluated_at     ON compliance_score_history(evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_score_history_account_evaluated ON compliance_score_history(account_id, evaluated_at DESC);

ALTER TABLE compliance_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to compliance_score_history"
  ON compliance_score_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


CREATE TABLE IF NOT EXISTS account_rule_overrides (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  rule_id               uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  is_active             boolean NOT NULL DEFAULT true,
  applied_by_profile_id uuid REFERENCES compliance_profiles(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (account_id, rule_id)
);

ALTER TABLE account_rule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to account_rule_overrides"
  ON account_rule_overrides FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


CREATE TABLE IF NOT EXISTS account_compliance_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES compliance_profiles(id) ON DELETE CASCADE,
  activated_at timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE account_compliance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to account_compliance_profiles"
  ON account_compliance_profiles FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


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

CREATE POLICY "Allow all access to resource_compliance_history"
  ON resource_compliance_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- Users & RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL UNIQUE,
  full_name           text NOT NULL DEFAULT '',
  role                text NOT NULL DEFAULT 'auditor'
    CHECK (role IN ('admin', 'power_user', 'auditor')),
  is_active           boolean NOT NULL DEFAULT true,
  password_hash       text,
  can_view_costs      boolean NOT NULL DEFAULT true,
  can_view_compliance boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_users ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS user_account_access (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  granted_by          uuid REFERENCES org_users(id),
  granted_at          timestamptz NOT NULL DEFAULT now(),
  can_view_costs      boolean NOT NULL DEFAULT true,
  can_view_compliance boolean NOT NULL DEFAULT true,
  UNIQUE(user_id, account_id)
);

ALTER TABLE user_account_access ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS compliance_result_notes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_result_id uuid NOT NULL REFERENCES compliance_results(id) ON DELETE CASCADE,
  account_id           uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  note                 text NOT NULL,
  created_by           uuid REFERENCES org_users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_result_id  ON compliance_result_notes(compliance_result_id);
CREATE INDEX IF NOT EXISTS idx_compliance_result_notes_account_id ON compliance_result_notes(account_id);

ALTER TABLE compliance_result_notes ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Helper functions (JWT claim based — works with PostgREST)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
$$;

CREATE OR REPLACE FUNCTION current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb->>'email';
$$;

CREATE OR REPLACE FUNCTION current_user_org_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM org_users
  WHERE id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_users
    WHERE id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid
      AND role = 'admin'
      AND is_active = true
  );
$$;


-- ---------------------------------------------------------------------------
-- RLS Policies for org_users
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view own profile"
  ON org_users FOR SELECT TO authenticated
  USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid);

CREATE POLICY "Admins can view all profiles"
  ON org_users FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert users"
  ON org_users FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Users can update own profile"
  ON org_users FOR UPDATE TO authenticated
  USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid)
  WITH CHECK (id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid);

CREATE POLICY "Admins can update any profile"
  ON org_users FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete non-self profiles"
  ON org_users FOR DELETE TO authenticated
  USING (
    is_admin()
    AND id <> (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid
  );

CREATE POLICY "Anon can check registration status"
  ON org_users FOR SELECT TO anon
  USING (true);


-- ---------------------------------------------------------------------------
-- RLS Policies for user_account_access
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view own access grants"
  ON user_account_access FOR SELECT TO authenticated
  USING (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid);

CREATE POLICY "Admins can view all access grants"
  ON user_account_access FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can grant access"
  ON user_account_access FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update access flags"
  ON user_account_access FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can revoke access"
  ON user_account_access FOR DELETE TO authenticated
  USING (is_admin());

CREATE POLICY "Anon can view access grants"
  ON user_account_access FOR SELECT TO anon
  USING (true);


-- ---------------------------------------------------------------------------
-- RLS Policies for compliance_result_notes
-- ---------------------------------------------------------------------------

CREATE POLICY "Allow all access to compliance_result_notes"
  ON compliance_result_notes FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- Auth RPC Functions
-- ---------------------------------------------------------------------------

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
  v_user    org_users%ROWTYPE;
  v_token   text;
  v_exp     bigint;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_user
  FROM org_users
  WHERE email = lower(p_email) AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF v_user.password_hash IS NULL OR v_user.password_hash = '' THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  v_exp := extract(epoch from now() + interval '8 hours')::bigint;

  v_payload := jsonb_build_object(
    'role',      'authenticated',
    'sub',       v_user.id::text,
    'email',     v_user.email,
    'user_role', v_user.role,
    'iat',       extract(epoch from now())::bigint,
    'exp',       v_exp
  );

  v_token := private.sign_jwt(v_payload);

  RETURN jsonb_build_object(
    'token',     v_token,
    'user_id',   v_user.id,
    'role',      v_user.role,
    'full_name', v_user.full_name,
    'email',     v_user.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_login(text, text) TO anon;


-- ---------------------------------------------------------------------------
-- Admin User Management RPC Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email     text,
  p_full_name text,
  p_password  text,
  p_role      text DEFAULT 'auditor'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_new_id      uuid;
  v_hash        text;
  v_resolved_role text;
  v_token       text;
  v_exp         bigint;
  v_payload     jsonb;
BEGIN
  v_caller_id := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;

  SELECT role INTO v_caller_role
  FROM org_users
  WHERE id = v_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF EXISTS (SELECT 1 FROM org_users WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  v_resolved_role := CASE WHEN p_role IN ('power_user', 'auditor') THEN p_role ELSE 'auditor' END;
  v_hash          := crypt(p_password, gen_salt('bf', 10));
  v_new_id        := gen_random_uuid();

  INSERT INTO org_users (id, email, full_name, role, is_active, password_hash)
  VALUES (v_new_id, lower(p_email), p_full_name, v_resolved_role, true, v_hash);

  RETURN jsonb_build_object('user_id', v_new_id, 'email', lower(p_email), 'role', v_resolved_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
BEGIN
  v_caller_id := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;

  SELECT role INTO v_caller_role
  FROM org_users
  WHERE id = v_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  DELETE FROM org_users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_change_password(p_user_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, private
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_hash        text;
BEGIN
  v_caller_id := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;

  SELECT role INTO v_caller_role
  FROM org_users
  WHERE id = v_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  v_hash := crypt(p_password, gen_salt('bf', 10));
  UPDATE org_users SET password_hash = v_hash, updated_at = now() WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_change_password(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS SETOF org_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM org_users ORDER BY created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE org_users SET role = p_role, updated_at = now() WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_user_active(p_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE org_users SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_active(uuid, boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_user_feature_flags(
  p_user_id             uuid,
  p_can_view_costs      boolean DEFAULT NULL,
  p_can_view_compliance boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE org_users SET
    can_view_costs      = COALESCE(p_can_view_costs, can_view_costs),
    can_view_compliance = COALESCE(p_can_view_compliance, can_view_compliance),
    updated_at          = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_feature_flags(uuid, boolean, boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_grant_account_access(p_user_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO user_account_access (user_id, account_id, granted_by)
  VALUES (p_user_id, p_account_id, (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid)
  ON CONFLICT (user_id, account_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_account_access(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_revoke_account_access(p_user_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM user_account_access WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_account_access(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_update_account_access_flags(
  p_user_id             uuid,
  p_account_id          uuid,
  p_can_view_costs      boolean DEFAULT NULL,
  p_can_view_compliance boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_account_access SET
    can_view_costs      = COALESCE(p_can_view_costs, can_view_costs),
    can_view_compliance = COALESCE(p_can_view_compliance, can_view_compliance)
  WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_account_access_flags(uuid, uuid, boolean, boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_get_user_account_grants(p_user_id uuid)
RETURNS SETOF user_account_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM user_account_access WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_account_grants(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_org_user_by_id(p_user_id uuid)
RETURNS SETOF org_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
BEGIN
  IF v_caller_id = p_user_id OR is_admin() THEN
    RETURN QUERY SELECT * FROM org_users WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_user_by_id(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_accessible_accounts()
RETURNS TABLE (
  id                uuid,
  name              text,
  api_token         text,
  webhook_api_key   text,
  last_sync_at      timestamptz,
  last_evaluated_at timestamptz,
  created_at        timestamptz,
  updated_at        timestamptz,
  can_view_costs    boolean,
  can_view_compliance boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE org_users.id = v_uid AND is_active = true;

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT a.id, a.name, a.api_token, a.webhook_api_key,
             a.last_sync_at, a.last_evaluated_at, a.created_at, a.updated_at,
             true::boolean, true::boolean
      FROM linode_accounts a ORDER BY a.name;
  ELSE
    RETURN QUERY
      SELECT a.id, a.name, a.api_token, a.webhook_api_key,
             a.last_sync_at, a.last_evaluated_at, a.created_at, a.updated_at,
             uaa.can_view_costs, uaa.can_view_compliance
      FROM linode_accounts a
      JOIN user_account_access uaa ON uaa.account_id = a.id AND uaa.user_id = v_uid
      ORDER BY a.name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_accounts() TO authenticated;


-- ---------------------------------------------------------------------------
-- Grant table permissions explicitly (covers existing tables)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Seed Data: Built-in Compliance Rules
-- ---------------------------------------------------------------------------

INSERT INTO compliance_rules (name, description, resource_types, condition_type, condition_config, severity, is_builtin, account_id)
SELECT v.name, v.description, v.resource_types, v.condition_type, v.condition_config::jsonb, v.severity, true, NULL
FROM (VALUES
  ('Linodes must have a firewall', 'Every Linode instance should be protected by at least one active firewall.', ARRAY['linode'], 'firewall_attached', '{}', 'critical'),
  ('No unrestricted inbound traffic', 'Firewall rules should not allow unrestricted inbound access (0.0.0.0/0 or ::/0) on sensitive ports.', ARRAY['firewall'], 'no_open_inbound', '{"sensitive_ports": [22, 3389, 3306, 5432, 6379, 27017]}', 'critical'),
  ('Firewall must be attached', 'A firewall that is not attached to any Linode provides no value.', ARRAY['firewall'], 'firewall_has_targets', '{}', 'info'),
  ('LKE clusters should have multiple nodes', 'Kubernetes clusters should have more than one node for high availability.', ARRAY['lke_cluster'], 'min_node_count', '{"min_count": 2}', 'warning'),
  ('Resources should have tags', 'Resources must have owner, environment, and cost-center tags for accountability, automation, and cost tracking.', ARRAY['linode', 'volume', 'nodebalancer', 'lke_cluster', 'database'], 'has_tags', '{"required_tags": [{"key": "owner", "value": "*"}, {"key": "environment", "value": "*"}, {"key": "cost-center", "value": "*"}]}', 'info'),
  ('Volumes should be attached', 'Unattached volumes still incur cost but provide no value.', ARRAY['volume'], 'volume_attached', '{}', 'info'),
  ('No unrestricted database access', 'Managed databases should not have 0.0.0.0/0 or ::/0 in their IP allow list.', ARRAY['database'], 'db_allowlist_check', '{"forbidden_cidrs": ["0.0.0.0/0", "::/0"], "require_non_empty": false}', 'critical'),
  ('Databases must not have public access enabled', 'Managed databases with public_access enabled are reachable from outside the VPC.', ARRAY['database'], 'db_public_access', '{"allow_public_access": false}', 'critical'),
  ('Linode Backups Enabled', 'Verifies that automated backups are enabled for every Linode instance.', ARRAY['linode'], 'linode_backups_enabled', '{}', 'critical'),
  ('Linode Disk Encryption Enabled', 'Verifies that disk encryption is enabled on every Linode instance.', ARRAY['linode'], 'linode_disk_encryption', '{}', 'critical'),
  ('Linode Deletion Lock Configured', 'Verifies that at least one deletion lock is configured to protect the instance.', ARRAY['linode'], 'linode_lock_configured', '{"required_lock_types": []}', 'warning'),
  ('Linode Instance Not Offline', 'Flags any Linode instance that is currently in an offline state.', ARRAY['linode'], 'linode_not_offline', '{}', 'warning'),
  ('All Linodes must have a recent successful backup', 'Verifies that a successful backup has occurred within the last 7 days.', ARRAY['linode'], 'linode_backup_recency', '{"max_age_days": 7}', 'warning'),
  ('LKE Control Plane ACL Configured', 'Verifies that the LKE cluster control plane has an ACL enabled.', ARRAY['lke_cluster'], 'lke_control_plane_acl', '{}', 'critical'),
  ('Volume Encryption Enabled', 'Block storage volumes must have disk encryption enabled.', ARRAY['volume'], 'volume_encryption_enabled', '{}', 'critical'),
  ('LKE Control Plane High Availability', 'LKE cluster control plane high availability must be enabled.', ARRAY['lke_cluster'], 'lke_control_plane_ha', '{}', 'warning'),
  ('LKE Audit Logs Enabled', 'LKE control plane audit logging must be enabled.', ARRAY['lke_cluster'], 'lke_audit_logs_enabled', '{}', 'warning'),
  ('Object Storage Bucket ACL', 'Object storage bucket ACL must not allow public-read or public-read-write access.', ARRAY['bucket'], 'bucket_acl_check', '{"required_acl": "", "forbidden_acls": ["public-read", "public-read-write", "authenticated-read"]}', 'critical'),
  ('All Users Must Have TFA Enabled', 'Every user on the account must have two-factor authentication enabled.', ARRAY[]::text[], 'tfa_users', '{}', 'critical'),
  ('Account Login IP Restriction', 'Account logins must only be permitted from a configured IP allow list.', ARRAY[]::text[], 'login_allowed_ips', '{}', 'warning'),
  ('Resources in Approved Regions', 'All resources must be deployed only in approved geographic regions.', ARRAY['linode', 'volume', 'lke_cluster', 'database', 'nodebalancer', 'bucket'], 'approved_regions', '{"approved_regions": []}', 'warning'),
  ('Firewall Policy Requirements', 'Firewall inbound and outbound policies must meet configurable security requirements.', ARRAY['linode'], 'firewall_rules_check', '{"required_inbound_policy": "DROP", "required_outbound_policy": "", "blocked_ports": [], "allowed_source_ips": [], "require_no_open_ports": false}', 'warning'),
  ('NodeBalancer Protocol Check', 'NodeBalancer ports must use only HTTPS protocol.', ARRAY['nodebalancer'], 'nodebalancer_protocol_check', '{"allowed_protocols": ["https"]}', 'warning'),
  ('NodeBalancer Allowed Ports', 'NodeBalancer must only listen on approved ports (default: 443).', ARRAY['nodebalancer'], 'nodebalancer_port_allowlist', '{"allowed_ports": [443]}', 'warning'),
  ('Firewall rules must not allow all ports', 'Detects inbound or outbound firewall rules that allow traffic on all ports.', ARRAY['firewall'], 'firewall_all_ports_allowed', '{"check_inbound": true, "check_outbound": false, "actions": ["ACCEPT"]}', 'warning'),
  ('Every firewall rule must have a description', 'Checks that all inbound and outbound firewall rules have a non-empty description.', ARRAY['firewall'], 'firewall_rule_descriptions', '{}', 'warning')
) AS v(name, description, resource_types, condition_type, condition_config, severity)
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules cr
  WHERE cr.condition_type = v.condition_type AND cr.account_id IS NULL
);


-- ---------------------------------------------------------------------------
-- Seed Data: Built-in Compliance Profiles
-- ---------------------------------------------------------------------------

INSERT INTO compliance_profiles (name, slug, description, tier, version, icon, rule_condition_types, is_builtin)
VALUES
  (
    'Level 1 — Foundation', 'cis-l1',
    'Covers foundational, low-friction controls — the checks that every cloud account should satisfy.',
    'foundation', 'v1.0', 'shield',
    ARRAY['firewall_attached','no_open_inbound','linode_backups_enabled','db_allowlist_check','db_public_access','tfa_users','has_tags','volume_attached','lke_control_plane_acl'],
    true
  ),
  (
    'Level 2 — Standard', 'cis-l2',
    'Adds deeper technical controls on top of the foundational set, appropriate for production workloads.',
    'standard', 'v1.0', 'shield-check',
    ARRAY['firewall_attached','firewall_rules_check','firewall_has_targets','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','has_tags','approved_regions','min_node_count','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check'],
    true
  ),
  (
    'SOC 2 Readiness', 'soc2',
    'Maps controls to SOC 2 Trust Service Criteria. Designed to support audit readiness.',
    'standard', '1.0', 'file-check',
    ARRAY['firewall_attached','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','lke_audit_logs_enabled','lke_control_plane_acl','bucket_acl_check','has_tags'],
    true
  ),
  (
    'PCI-DSS Baseline', 'pci-dss',
    'Subset of controls aligned to PCI DSS v4.0. Intended as a starting point.',
    'strict', '1.0', 'credit-card',
    ARRAY['firewall_attached','firewall_rules_check','no_open_inbound','linode_backups_enabled','linode_backup_recency','linode_disk_encryption','linode_lock_configured','volume_encryption_enabled','db_allowlist_check','db_public_access','tfa_users','login_allowed_ips','approved_regions','lke_control_plane_ha','lke_control_plane_acl','lke_audit_logs_enabled','bucket_acl_check','nodebalancer_protocol_check','nodebalancer_port_allowlist'],
    true
  ),
  (
    'Minimal / Dev', 'minimal-dev',
    'Lightweight profile for development and staging. Not suitable for production.',
    'foundation', '1.0', 'wrench',
    ARRAY['firewall_attached','no_open_inbound','db_allowlist_check','db_public_access','tfa_users'],
    true
  ),
  (
    'All Rules', 'all-rules',
    'Enables every available compliance rule.',
    'strict', 'v1.0', 'shield-check',
    ARRAY['approved_regions','bucket_acl_check','db_allowlist_check','db_public_access','firewall_all_ports_allowed','firewall_attached','firewall_has_targets','firewall_rule_descriptions','firewall_rules_check','has_tags','linode_backup_recency','linode_backups_enabled','linode_disk_encryption','linode_lock_configured','linode_not_offline','lke_audit_logs_enabled','lke_control_plane_acl','lke_control_plane_ha','login_allowed_ips','min_node_count','no_open_inbound','nodebalancer_port_allowlist','nodebalancer_protocol_check','tfa_users','volume_attached','volume_encryption_enabled'],
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  tier                 = EXCLUDED.tier,
  version              = EXCLUDED.version,
  icon                 = EXCLUDED.icon,
  rule_condition_types = EXCLUDED.rule_condition_types,
  is_builtin           = EXCLUDED.is_builtin,
  updated_at           = now();
