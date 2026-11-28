-- =============================================================================
-- 同じ意味の列の型・NULL 可否・既定値を揃える
--
-- 1. competitions.pool_type: integer → smallint (records / relay_records / race_pace_models と同じ)。
--    calendar_view と competitions_sync_record_pool_type トリガがこの列を参照しているので、
--    どちらも今の定義のまま作り直す。
-- 2. practice_log_templates を practice_logs に揃える:
--    style varchar(10) → text、swim_category varchar(10) → swim_category_enum、
--    circle integer → numeric(10,2) (ログ側はサークルを 1:30.5 のように小数で持てる)。
-- 3. 既定値があるのに NULL を許していた列を NOT NULL にする
--    (created_at / updated_at と、真偽値・件数・配列の列)。本番に NULL は0件 (2026-11-28 確認)。
-- 4. uuid の既定値を gen_random_uuid() に揃える (goals 系だけ uuid_generate_v4() だった)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. competitions.pool_type
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def text := pg_get_viewdef('public.calendar_view'::regclass, true);
  v_opts text[] := (SELECT reloptions FROM pg_class WHERE oid = 'public.calendar_view'::regclass);
  v_comment text := obj_description('public.calendar_view'::regclass, 'pg_class');
  v_trigger text := (
    SELECT pg_get_triggerdef(oid)
    FROM pg_trigger
    WHERE tgrelid = 'public.competitions'::regclass AND tgname = 'competitions_sync_record_pool_type'
  );
BEGIN
  DROP VIEW public.calendar_view;
  DROP TRIGGER competitions_sync_record_pool_type ON public.competitions;
  ALTER TABLE public.competitions ALTER COLUMN pool_type TYPE smallint;
  EXECUTE v_trigger;
  EXECUTE format(
    'CREATE VIEW public.calendar_view WITH (%s) AS %s',
    array_to_string(v_opts, ', '),
    v_def
  );
  IF v_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON VIEW public.calendar_view IS %L', v_comment);
  END IF;
END;
$$;

-- 20260705000001_restrict_anon_grants_least_privilege と同じ権限 (anon には付けない)
REVOKE ALL ON TABLE "public"."calendar_view" FROM PUBLIC, "anon";
GRANT ALL ON TABLE "public"."calendar_view" TO "authenticated", "service_role";

-- get_team_member_goals は competitions.pool_type を RETURNS TABLE の competition_pool_type integer として
-- 返している。型が変わると実行時に「structure of query does not match function result type」になるので、
-- 返り値の型 (アプリとの契約) は integer のまま、本体で明示的に変換する。
-- 本体を写すと他の migration の変更を上書きするので、該当の1行だけを置き換えて作り直す。
DO $$
DECLARE
  v_old text := pg_get_functiondef('public.get_team_member_goals(uuid, uuid)'::regprocedure);
  v_new text;
BEGIN
  v_new := replace(
    v_old,
    E'    c.pool_type,\n    -- getBestTimeForStyle',
    E'    c.pool_type::integer,\n    -- getBestTimeForStyle'
  );
  IF v_new = v_old THEN
    RAISE EXCEPTION 'get_team_member_goals の本体が想定の形ではありません。migration を見直してください';
  END IF;
  EXECUTE v_new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. practice_log_templates
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."practice_log_templates" ALTER COLUMN "style" TYPE "text";

ALTER TABLE "public"."practice_log_templates" ALTER COLUMN "swim_category" DROP DEFAULT;
ALTER TABLE "public"."practice_log_templates"
  ALTER COLUMN "swim_category" TYPE "public"."swim_category_enum"
  USING "swim_category"::"public"."swim_category_enum";
ALTER TABLE "public"."practice_log_templates"
  ALTER COLUMN "swim_category" SET DEFAULT 'Swim'::"public"."swim_category_enum";

ALTER TABLE "public"."practice_log_templates" ALTER COLUMN "circle" TYPE numeric(10,2);

-- -----------------------------------------------------------------------------
-- 3. NOT NULL
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.is_nullable = 'YES'
      AND c.column_default IS NOT NULL
      AND (
        c.column_name IN ('created_at', 'updated_at')
        OR (c.table_name, c.column_name) IN (
          ('announcements', 'is_published'),
          ('practice_log_templates', 'is_favorite'),
          ('practice_log_templates', 'use_count'),
          ('practice_log_templates', 'tag_ids'),
          ('practices', 'image_paths'),
          ('competitions', 'image_paths'),
          ('user_subscriptions', 'cancel_at_period_end'),
          ('app_daily_usage', 'daily_tokens_used')
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', r.table_name, r.column_name);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. uuid の既定値
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."goals" ALTER COLUMN "id" SET DEFAULT "gen_random_uuid"();
ALTER TABLE "public"."milestones" ALTER COLUMN "id" SET DEFAULT "gen_random_uuid"();
ALTER TABLE "public"."milestone_achievements" ALTER COLUMN "id" SET DEFAULT "gen_random_uuid"();
