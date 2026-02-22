/*
  # Apply Missed Functional Migrations

  Three functional gaps were identified between the full schema setup and the
  final state of the incremental migrations that were never applied.

  ## Changes

  ### 1. Fix auth function search_path (20260220201432)
  auth_register and auth_login need `SET search_path = public, extensions` so that
  crypt() and gen_salt() from pgcrypto (installed in the extensions schema) resolve
  correctly in the SECURITY DEFINER context.

  ### 2. Fix private.sign_jwt to use extensions.hmac explicitly (20260220202117)
  The hmac() call must use the fully-qualified extensions.hmac() to guarantee
  resolution in the SECURITY DEFINER context.

  ### 3. Fix registration_open function ownership and privileges (20260220175341 + 20260220175353)
  Final state: SECURITY DEFINER, OWNER = postgres, revoke from PUBLIC, grant to
  anon/authenticated/service_role. The intermediate anon SELECT policy on org_users
  is removed.
*/

-- 1. Fix auth_register search_path
DROP FUNCTION IF EXISTS public.auth_register(text, text, text);

CREATE OR REPLACE FUNCTION public.auth_register(
  p_email    text,
  p_fullname text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- 2. Fix auth_login search_path
DROP FUNCTION IF EXISTS public.auth_login(text, text);

CREATE OR REPLACE FUNCTION public.auth_login(
  p_email    text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- 3. Fix private.sign_jwt to use extensions.hmac explicitly
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

-- 4. Fix registration_open function ownership and privileges (final state)
DROP POLICY IF EXISTS "anon can count org_users for registration check" ON public.org_users;

DROP FUNCTION IF EXISTS public.registration_open();

CREATE OR REPLACE FUNCTION public.registration_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.org_users LIMIT 1);
$$;

ALTER FUNCTION public.registration_open() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_open() TO anon;
GRANT EXECUTE ON FUNCTION public.registration_open() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registration_open() TO service_role;
