-- supabase start の DB (GoTrue が migration で差し替えた版) の auth 関数の定義。
-- bare の supabase/postgres image 同梱の auth.uid() は request.jwt.claim.sub しか読まず、
-- pgTAP の qa_login_as (request.jwt.claims に JSON を入れる) が効かない。
-- 所有者が supabase_auth_admin なので、supabase_admin で流す (setup_db.sh)。
-- 取得元: 2026-11-09 のローカル supabase start の DB で pg_get_functiondef したもの
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
;
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$
;
CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$
;
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$
;
