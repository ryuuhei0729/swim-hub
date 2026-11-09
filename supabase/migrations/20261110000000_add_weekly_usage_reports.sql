-- =============================================================================
-- 週次利用レポート: 保存テーブル2つ + 集計 RPC + 送信済み記録 RPC
--
-- 仕様: docs/specs/weekly-usage-report.md
--
-- 週は JST の土曜 00:00 から翌土曜 00:00 までの半開区間 [period_start, period_end)。
-- 指標の定義・キー名・区分は仕様の「指標」を参照。区分ごとの表示名・順序は
-- Edge Function の整形側 (_shared/weekly-report-format.ts) が持つ。
--
-- 冪等性: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / REVOKE / GRANT のみ。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. weekly_usage_reports: 週ごとの集計結果。先週比は week_start - 7 の行と比べる
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."weekly_usage_reports" (
  "week_start" date NOT NULL PRIMARY KEY,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "uncategorized_tables" text[] NOT NULL DEFAULT '{}'::text[],
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "email_sent_at" timestamptz
);

COMMENT ON TABLE "public"."weekly_usage_reports" IS
  '週次利用レポートの集計結果 (week_start = JST の土曜の日付)。generate_weekly_usage_report が書き、
mark_weekly_usage_report_sent が email_sent_at を書く。RLS はポリシー無し (default deny) で、
service_role 限定 RPC 経由でのみ読み書きされる。';

ALTER TABLE "public"."weekly_usage_reports" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."weekly_usage_reports" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."weekly_usage_reports" TO "service_role";

-- -----------------------------------------------------------------------------
-- 2. user_subscription_snapshots: 週ごとの premium 行のスナップショット
--    user_subscriptions には状態遷移の履歴が無いため、前週との差分を取るために保存する。
--    履歴として残すので users への外部キーは張らない。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."user_subscription_snapshots" (
  "week_start" date NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text,
  "provider" text,
  "cancel_at_period_end" boolean,
  "provider_environment" text,
  "premium_expires_at" timestamptz,
  PRIMARY KEY ("week_start", "user_id")
);

COMMENT ON TABLE "public"."user_subscription_snapshots" IS
  'premium の user_subscriptions 行の週次スナップショット。その週の weekly_usage_reports 行がまだ
無いときの初回集計で1回だけ取る。RLS はポリシー無し (default deny)。';

ALTER TABLE "public"."user_subscription_snapshots" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."user_subscription_snapshots" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_subscription_snapshots" TO "service_role";

-- -----------------------------------------------------------------------------
-- 3. generate_weekly_usage_report: 集計 + スナップショット + 保存 + 先週値を返す
--
--   p_week_start: 対象週の土曜 (JST の日付)。NULL なら、JST の今日以前の直近の土曜の7日前。
--   土曜以外は例外。
--   分類済みテーブルと除外リストは、この関数の中の定数配列だけが唯一の定義元。
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date)
RETURNS jsonb
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
  v_week date;
  v_s timestamptz;       -- period_start
  v_e timestamptz;       -- period_end
  v_cs timestamptz;      -- コホートの始端 (week_start - 7)
  v_ds date;             -- 日付列の範囲 [v_ds, v_de)
  v_de date;
  v_prev_week date;
  v_first boolean;
  v_has_prev boolean;
  v_m jsonb;
  v_classified constant text[] := ARRAY[
    'users', 'practices', 'practice_logs', 'practice_tags', 'practice_log_templates',
    'competitions', 'entries', 'records', 'relay_records', 'goals', 'milestones',
    'teams', 'team_memberships', 'team_groups', 'team_attendance', 'announcements',
    'token_consumption_log', 'app_daily_usage', 'guest_scan_daily_usage', 'contact_messages',
    -- 子テーブル (親の指標の中で使い、単独では数えない)
    'practice_times', 'split_times', 'relay_record_legs'
  ];
  v_excluded constant text[] := ARRAY[
    'practice_log_tags', 'team_group_memberships', 'user_team_calendar_colors', 'milestone_achievements',
    'styles', 'race_pace_models',
    'processed_webhook_events', 'contact_rate_limit_daily_usage', 'user_sessions',
    'weekly_usage_reports', 'user_subscription_snapshots',
    'user_subscriptions'
  ];
  v_uncategorized text[];
  v_row public.weekly_usage_reports%ROWTYPE;
  v_prev public.weekly_usage_reports%ROWTYPE;
BEGIN
  IF p_week_start IS NULL THEN
    v_week := v_today - ((extract(isodow FROM v_today)::int + 1) % 7) - 7;
  ELSE
    IF extract(isodow FROM p_week_start) <> 6 THEN
      RAISE EXCEPTION 'p_week_start must be a Saturday: %', p_week_start;
    END IF;
    v_week := p_week_start;
  END IF;

  -- 同じ週の同時実行で、スナップショットの「初回だけ」判定が二重に通らないようにする
  PERFORM pg_advisory_xact_lock(hashtext('generate_weekly_usage_report'));

  v_s := (v_week::timestamp) AT TIME ZONE 'Asia/Tokyo';
  v_e := ((v_week + 7)::timestamp) AT TIME ZONE 'Asia/Tokyo';
  v_cs := ((v_week - 7)::timestamp) AT TIME ZONE 'Asia/Tokyo';
  v_ds := v_week;
  v_de := v_week + 7;
  v_prev_week := v_week - 7;

  SELECT * INTO v_prev FROM public.weekly_usage_reports WHERE week_start = v_prev_week;
  v_has_prev := FOUND;

  -- スナップショットは、その週の行がまだ無いとき (初回集計) だけ取る
  v_first := NOT EXISTS (SELECT 1 FROM public.weekly_usage_reports WHERE week_start = v_week);
  IF v_first THEN
    INSERT INTO public.user_subscription_snapshots
      (week_start, user_id, status, provider, cancel_at_period_end, provider_environment, premium_expires_at)
    SELECT v_week, us.id, us.status, us.provider, us.cancel_at_period_end, us.provider_environment, us.premium_expires_at
    FROM public.user_subscriptions us
    WHERE us.plan = 'premium'
    ON CONFLICT (week_start, user_id) DO NOTHING;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. アカウント・利用
  -- ---------------------------------------------------------------------------
  v_m := jsonb_build_object(
    'account.users_new', (SELECT count(*) FROM public.users WHERE created_at >= v_s AND created_at < v_e),
    'account.active_users', (
      SELECT count(DISTINCT u) FROM (
        SELECT coalesce(created_by, user_id) AS u FROM public.practices WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.practice_logs WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.practice_tags WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.practice_log_templates WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT coalesce(created_by, user_id) FROM public.competitions WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.entries WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.records WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT created_by FROM public.relay_records WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.goals WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT g.user_id FROM public.milestones m JOIN public.goals g ON g.id = m.goal_id
          WHERE m.created_at >= v_s AND m.created_at < v_e
        UNION ALL SELECT user_id FROM public.team_memberships WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT created_by FROM public.team_groups WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT created_by FROM public.announcements WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT created_by FROM public.teams WHERE created_at >= v_s AND created_at < v_e
        UNION ALL SELECT user_id FROM public.team_attendance
          WHERE status IS NOT NULL AND updated_at >= v_s AND updated_at < v_e
      ) t WHERE u IS NOT NULL
    )
  );

  -- ---------------------------------------------------------------------------
  -- 2. 個人の練習 / 3. 個人の大会
  --    practice_times / split_times は保存のたびに作り直されるので、親の件数で数える
  -- ---------------------------------------------------------------------------
  v_m := v_m || jsonb_build_object(
    'practice.personal_practices', (SELECT count(*) FROM public.practices
      WHERE team_id IS NULL AND created_at >= v_s AND created_at < v_e),
    'practice.personal_practices_with_image', (SELECT count(*) FROM public.practices
      WHERE team_id IS NULL AND created_at >= v_s AND created_at < v_e
        AND jsonb_typeof(image_paths) = 'array' AND jsonb_array_length(image_paths) > 0),
    'practice.personal_logs', (SELECT count(*) FROM public.practice_logs l
      JOIN public.practices p ON p.id = l.practice_id
      WHERE p.team_id IS NULL AND l.created_at >= v_s AND l.created_at < v_e),
    'practice.personal_logs_with_times', (SELECT count(*) FROM public.practice_logs l
      JOIN public.practices p ON p.id = l.practice_id
      WHERE p.team_id IS NULL AND l.created_at >= v_s AND l.created_at < v_e
        AND EXISTS (SELECT 1 FROM public.practice_times t WHERE t.practice_log_id = l.id)),
    'practice.tags', (SELECT count(*) FROM public.practice_tags WHERE created_at >= v_s AND created_at < v_e),
    'practice.log_templates', (SELECT count(*) FROM public.practice_log_templates
      WHERE created_at >= v_s AND created_at < v_e),
    'competition.personal_competitions', (SELECT count(*) FROM public.competitions
      WHERE team_id IS NULL AND created_at >= v_s AND created_at < v_e),
    'competition.personal_entries', (SELECT count(*) FROM public.entries
      WHERE team_id IS NULL AND created_at >= v_s AND created_at < v_e),
    'competition.personal_records', (SELECT count(*) FROM public.records
      WHERE team_id IS NULL AND created_at >= v_s AND created_at < v_e),
    'competition.personal_records_with_video', (SELECT count(*) FROM public.records
      WHERE team_id IS NULL AND created_at >= v_s AND created_at < v_e
        AND video_path IS NOT NULL AND video_path <> ''),
    'competition.personal_records_with_splits', (SELECT count(*) FROM public.records r
      WHERE r.team_id IS NULL AND r.created_at >= v_s AND r.created_at < v_e
        AND EXISTS (SELECT 1 FROM public.split_times s WHERE s.record_id = r.id))
  );

  -- ---------------------------------------------------------------------------
  -- 4. チーム
  -- ---------------------------------------------------------------------------
  v_m := v_m || jsonb_build_object(
    'team.teams', (SELECT count(*) FROM public.teams WHERE created_at >= v_s AND created_at < v_e),
    'team.memberships_new', (SELECT count(*) FROM public.team_memberships
      WHERE created_at >= v_s AND created_at < v_e),
    'team.memberships_approved', (SELECT count(*) FROM public.team_memberships
      WHERE status = 'approved' AND created_at >= v_s AND created_at < v_e),
    'team.practices', (SELECT count(*) FROM public.practices
      WHERE team_id IS NOT NULL AND created_at >= v_s AND created_at < v_e),
    'team.practices_with_logs', (SELECT count(*) FROM public.practices p
      WHERE p.team_id IS NOT NULL AND p.created_at >= v_s AND p.created_at < v_e
        AND EXISTS (SELECT 1 FROM public.practice_logs l WHERE l.practice_id = p.id)),
    'team.competitions', (SELECT count(*) FROM public.competitions
      WHERE team_id IS NOT NULL AND created_at >= v_s AND created_at < v_e),
    'team.entries', (SELECT count(*) FROM public.entries
      WHERE team_id IS NOT NULL AND created_at >= v_s AND created_at < v_e),
    'team.records', (SELECT count(*) FROM public.records
      WHERE team_id IS NOT NULL AND created_at >= v_s AND created_at < v_e),
    'team.records_with_splits', (SELECT count(*) FROM public.records r
      WHERE r.team_id IS NOT NULL AND r.created_at >= v_s AND r.created_at < v_e
        AND EXISTS (SELECT 1 FROM public.split_times s WHERE s.record_id = r.id)),
    'team.relay_records', (SELECT count(*) FROM public.relay_records
      WHERE created_at >= v_s AND created_at < v_e),
    -- 出欠の行は自動作成時に status NULL で作られ、回答で UPDATE される。created_at ではなく
    -- 回答時に更新される updated_at で数える
    'team.attendance', (SELECT count(*) FROM public.team_attendance
      WHERE status IS NOT NULL AND updated_at >= v_s AND updated_at < v_e),
    'team.announcements', (SELECT count(*) FROM public.announcements
      WHERE created_at >= v_s AND created_at < v_e),
    'team.groups', (SELECT count(*) FROM public.team_groups WHERE created_at >= v_s AND created_at < v_e)
  );

  -- ---------------------------------------------------------------------------
  -- 5. 目標 (マイルストーンの type は固定で列挙せず動的にキーにする)
  -- ---------------------------------------------------------------------------
  v_m := v_m || jsonb_build_object(
    'goal.created', (SELECT count(*) FROM public.goals WHERE created_at >= v_s AND created_at < v_e),
    'goal.achieved', (SELECT count(*) FROM public.goals WHERE achieved_at >= v_s AND achieved_at < v_e),
    'goal.milestones_achieved', (SELECT count(*) FROM public.milestones
      WHERE achieved_at >= v_s AND achieved_at < v_e)
  ) || coalesce((
    SELECT jsonb_object_agg('goal.milestones_created.' || type, n)
    FROM (SELECT type, count(*) AS n FROM public.milestones
          WHERE created_at >= v_s AND created_at < v_e AND type IS NOT NULL GROUP BY type) mt
  ), '{}'::jsonb);

  -- ---------------------------------------------------------------------------
  -- 7. Scanner / Timer と 8. サポート
  -- ---------------------------------------------------------------------------
  v_m := v_m || jsonb_build_object(
    'guest.scans', (SELECT coalesce(sum(count), 0) FROM public.guest_scan_daily_usage
      WHERE usage_date >= v_ds AND usage_date < v_de),
    'guest.unique_ips', (SELECT count(DISTINCT ip_hash) FROM public.guest_scan_daily_usage
      WHERE usage_date >= v_ds AND usage_date < v_de),
    'support.contact_messages', (SELECT count(*) FROM public.contact_messages
      WHERE created_at >= v_s AND created_at < v_e)
  ) || coalesce((
    SELECT jsonb_object_agg('token.' || app || '.' || action_type, n)
    FROM (SELECT app, action_type, count(*) AS n FROM public.token_consumption_log
          WHERE created_at >= v_s AND created_at < v_e GROUP BY app, action_type) tk
  ), '{}'::jsonb) || coalesce((
    SELECT jsonb_object_agg('usage.' || app || '.active_users', n)
    FROM (SELECT app, count(DISTINCT user_id) AS n FROM public.app_daily_usage
          WHERE usage_date >= v_ds AND usage_date < v_de AND usage_count > 0 GROUP BY app) au
  ), '{}'::jsonb);

  -- ---------------------------------------------------------------------------
  -- 9. 動線 (1週遅れのコホート: [week_start - 7, week_start) に登録した人)
  --    登録から7日以内 (created_at < users.created_at + 7 days) の行動を1人1回で数える
  -- ---------------------------------------------------------------------------
  v_m := v_m || (
    WITH cohort AS (
      SELECT id, created_at FROM public.users WHERE created_at >= v_cs AND created_at < v_s
    )
    SELECT jsonb_build_object(
      'funnel.cohort_size', (SELECT count(*) FROM cohort),
      'funnel.practice', (SELECT count(*) FROM cohort c WHERE
        EXISTS (SELECT 1 FROM public.practices p WHERE coalesce(p.created_by, p.user_id) = c.id
                  AND p.created_at < c.created_at + interval '7 days')
        OR EXISTS (SELECT 1 FROM public.practice_logs l WHERE l.user_id = c.id
                  AND l.created_at < c.created_at + interval '7 days')),
      'funnel.competition', (SELECT count(*) FROM cohort c WHERE
        EXISTS (SELECT 1 FROM public.competitions x WHERE coalesce(x.created_by, x.user_id) = c.id
                  AND x.created_at < c.created_at + interval '7 days')
        OR EXISTS (SELECT 1 FROM public.entries x WHERE x.user_id = c.id
                  AND x.created_at < c.created_at + interval '7 days')
        OR EXISTS (SELECT 1 FROM public.records x WHERE x.user_id = c.id
                  AND x.created_at < c.created_at + interval '7 days')),
      'funnel.team', (SELECT count(*) FROM cohort c WHERE
        EXISTS (SELECT 1 FROM public.team_memberships x WHERE x.user_id = c.id
                  AND x.created_at < c.created_at + interval '7 days')),
      'funnel.goal', (SELECT count(*) FROM cohort c WHERE
        EXISTS (SELECT 1 FROM public.goals x WHERE x.user_id = c.id
                  AND x.created_at < c.created_at + interval '7 days'))
    )
  );

  -- ---------------------------------------------------------------------------
  -- 6. 課金。常にその週のスナップショットから計算する (本番 = provider_environment が
  --    sandbox でないもの。NULL は本番扱い)。前週の保存行が無いときはフローの指標を出さない
  -- ---------------------------------------------------------------------------
  v_m := v_m || jsonb_build_object(
    'billing.cancel_pending', (SELECT count(*) FROM public.user_subscription_snapshots s
      WHERE s.week_start = v_week AND s.provider_environment IS DISTINCT FROM 'sandbox'
        AND (s.status = 'canceled' OR s.cancel_at_period_end IS TRUE)),
    'billing.sandbox_premium_total', (SELECT count(*) FROM public.user_subscription_snapshots s
      WHERE s.week_start = v_week AND s.provider_environment = 'sandbox')
  ) || coalesce((
    SELECT jsonb_object_agg('billing.premium_total.' || prov, n)
    FROM (SELECT coalesce(s.provider, 'unknown') AS prov, count(*) AS n
          FROM public.user_subscription_snapshots s
          WHERE s.week_start = v_week AND s.provider_environment IS DISTINCT FROM 'sandbox'
          GROUP BY 1) pt
  ), '{}'::jsonb);

  IF v_has_prev THEN
    v_m := v_m || jsonb_build_object(
      'billing.new_cancel_pending', (SELECT count(*) FROM public.user_subscription_snapshots s
        WHERE s.week_start = v_week AND s.provider_environment IS DISTINCT FROM 'sandbox'
          AND (s.status = 'canceled' OR s.cancel_at_period_end IS TRUE)
          AND NOT EXISTS (SELECT 1 FROM public.user_subscription_snapshots p
            WHERE p.week_start = v_prev_week AND p.user_id = s.user_id
              AND p.provider_environment IS DISTINCT FROM 'sandbox'
              AND (p.status = 'canceled' OR p.cancel_at_period_end IS TRUE))),
      'billing.churned', (SELECT count(*) FROM public.user_subscription_snapshots p
        WHERE p.week_start = v_prev_week AND p.provider_environment IS DISTINCT FROM 'sandbox'
          AND NOT EXISTS (SELECT 1 FROM public.user_subscription_snapshots s
            WHERE s.week_start = v_week AND s.user_id = p.user_id
              AND s.provider_environment IS DISTINCT FROM 'sandbox'))
    ) || coalesce((
      -- 今週の有料がいる provider は、新規有料が0件でも 0 で出す (出さないと 0 → N の週に「新規指標」と表示される)
      SELECT jsonb_object_agg('billing.new_premium.' || prov, n)
      FROM (SELECT coalesce(s.provider, 'unknown') AS prov,
                   count(*) FILTER (WHERE NOT EXISTS (
                     SELECT 1 FROM public.user_subscription_snapshots p
                     WHERE p.week_start = v_prev_week AND p.user_id = s.user_id
                       AND p.provider_environment IS DISTINCT FROM 'sandbox')) AS n
            FROM public.user_subscription_snapshots s
            WHERE s.week_start = v_week AND s.provider_environment IS DISTINCT FROM 'sandbox'
            GROUP BY 1) np
    ), '{}'::jsonb);
  END IF;

  -- ---------------------------------------------------------------------------
  -- 未分類テーブル (public の実テーブルのうち、分類済みにも除外リストにも無いもの)
  -- ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(tablename::text ORDER BY tablename), '{}'::text[]) INTO v_uncategorized
  FROM pg_tables
  WHERE schemaname = 'public'
    AND NOT (tablename::text = ANY (v_classified))
    AND NOT (tablename::text = ANY (v_excluded));

  -- 同じ週の再実行は上書きする。email_sent_at は更新しない (巻き戻さない)
  INSERT INTO public.weekly_usage_reports AS r
    (week_start, period_start, period_end, metrics, uncategorized_tables, generated_at)
  VALUES (v_week, v_s, v_e, v_m, v_uncategorized, now())
  ON CONFLICT (week_start) DO UPDATE
    SET period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        metrics = EXCLUDED.metrics,
        uncategorized_tables = EXCLUDED.uncategorized_tables,
        generated_at = EXCLUDED.generated_at
  RETURNING r.* INTO v_row;

  RETURN jsonb_build_object(
    'week_start', v_row.week_start,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end,
    'generated_at', v_row.generated_at,
    'metrics', v_row.metrics,
    'uncategorized_tables', to_jsonb(v_row.uncategorized_tables),
    'email_sent_at', v_row.email_sent_at,
    'previous_metrics', CASE WHEN v_has_prev THEN v_prev.metrics ELSE NULL END,
    'previous_email_sent_at', CASE WHEN v_has_prev THEN v_prev.email_sent_at ELSE NULL END
  );
END;
$$;

ALTER FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date) IS
  '週次利用レポートを集計して weekly_usage_reports に保存し、先週 (week_start - 7 ちょうど) の値と
合わせて返す。p_week_start NULL は JST の今日以前の直近の土曜の7日前。土曜以外は例外。service_role 限定。';

REVOKE ALL ON FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."generate_weekly_usage_report"("p_week_start" date) TO "service_role";

-- -----------------------------------------------------------------------------
-- 4. mark_weekly_usage_report_sent: 送信済みの時刻を記録する
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.weekly_usage_reports SET email_sent_at = now() WHERE week_start = p_week_start;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'weekly_usage_reports row not found: %', p_week_start;
  END IF;
END;
$$;

ALTER FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date) IS
  '週次利用レポートの email_sent_at を now() にする。対象の行が無ければ例外。service_role 限定。';

REVOKE ALL ON FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_weekly_usage_report_sent"("p_week_start" date) TO "service_role";
