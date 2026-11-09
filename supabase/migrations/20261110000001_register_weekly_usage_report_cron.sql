-- =============================================================================
-- 週次利用レポートの cron 登録
--
-- 仕様: docs/specs/weekly-usage-report.md
--   pg_cron (毎週金曜 22:00 UTC = 土曜 07:00 JST)
--     → invoke_weekly_usage_report()  … vault の project_url と weekly_report_cron_secret で pg_net.http_post
--       → Edge Function weekly-report
--
-- vault に値が無い環境 (ローカル・CI) では invoke_weekly_usage_report() は NOTICE を出して何もしない。
-- secret の値はこの migration に書かない。
-- =============================================================================

-- pg_net は initial_schema.sql で DROP されている。失敗しても migration は通す
DO $migration$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net の有効化に失敗しました (%). invoke_weekly_usage_report() は HTTP を送れません。', SQLERRM;
END $migration$;

-- cron 専用 (postgres)。vault の secret が2つ揃い、pg_net があるときだけ Edge Function を呼ぶ
CREATE OR REPLACE FUNCTION "public"."invoke_weekly_usage_report"()
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'vault が無いため週次利用レポートを呼び出しません。';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'weekly_report_cron_secret' LIMIT 1;

  IF coalesce(v_url, '') = '' OR coalesce(v_secret, '') = '' THEN
    RAISE NOTICE 'vault に project_url / weekly_report_cron_secret が無いため週次利用レポートを呼び出しません。';
    RETURN;
  END IF;

  IF to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'pg_net が無いため週次利用レポートを呼び出しません。';
    RETURN;
  END IF;

  -- Edge Function は処理に数秒かかるので timeout は長めに取る
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/weekly-report',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 30000
  );
END;
$$;

ALTER FUNCTION "public"."invoke_weekly_usage_report"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoke_weekly_usage_report"() IS
  'pg_cron から週次利用レポートの Edge Function (weekly-report) を pg_net で呼ぶ。vault の project_url と
weekly_report_cron_secret が無い環境では NOTICE を出して何もしない。cron (postgres) 専用で、service_role にも EXECUTE を付けない。';

REVOKE ALL ON FUNCTION "public"."invoke_weekly_usage_report"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."invoke_weekly_usage_report"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."invoke_weekly_usage_report"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."invoke_weekly_usage_report"() FROM "service_role";

-- pg_cron があるときだけ登録する (20260820000001 が pg_cron を有効化する。無い環境では NOTICE)。
-- cron.schedule は同一ジョブ名の再呼び出しが更新になるので冪等
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'weekly-usage-report',
      '0 22 * * 5',
      $job$SELECT public.invoke_weekly_usage_report()$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron が無効なため weekly-usage-report を登録しませんでした。';
  END IF;
END $migration$;
