/*
  # Custom JWT Auth RPC Functions (PostgREST-compatible)

  ## Summary
  Replaces GoTrue-based auth with direct PostgREST RPC functions for login and
  registration. This is needed for the self-hosted deployment which runs only
  PostgREST (no GoTrue/Supabase Auth service).

  ## Changes
  1. Enables pgcrypto extension for password hashing (bcrypt via crypt/gen_salt)
  2. Creates private schema for internal helpers
  3. Adds sign_jwt helper in private schema
  4. Adds `auth_register` RPC — hashes password, inserts org_users row, returns JWT
  5. Adds `auth_login` RPC — verifies password hash, returns JWT
  6. Both functions return a JSON object `{ token, user_id, role, full_name, email }`
  7. JWTs are signed using the PostgREST JWT secret via app.settings.jwt_secret GUC
  8. Grants EXECUTE on both functions to the `anon` role

  ## Security
  - Passwords are bcrypt-hashed with cost factor 10
  - JWTs use HS256 signed by the server-side secret; the secret is never returned
  - Both RPCs are SECURITY DEFINER so anon can read/write org_users safely
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.sign_jwt(payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
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
    RAISE EXCEPTION 'JWT secret not configured (app.settings.jwt_secret)';
  END IF;

  header_b64  := replace(replace(
    encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'),
    '+', '-'), '/', '_');
  header_b64  := rtrim(header_b64, E'\n=');

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

CREATE OR REPLACE FUNCTION public.auth_register(
  p_email    text,
  p_password text,
  p_fullname text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
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

CREATE OR REPLACE FUNCTION public.auth_login(
  p_email    text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
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

GRANT EXECUTE ON FUNCTION public.auth_register(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.auth_login(text, text)          TO anon;
