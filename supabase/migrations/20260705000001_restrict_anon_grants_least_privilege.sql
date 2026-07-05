-- =============================================================================
-- Issue #40: 複数テーブルに anon への広すぎる GRANT が残存（最小権限化）
-- =============================================================================
--
-- 背景:
--   initial_schema.sql の GRANT ALL ON TABLE ... TO anon および
--   ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon により、
--   ほぼ全テーブルに anon（未認証ユーザー）への全権限が付与されていた。
--   RLS により実際のデータアクセスは 0 行に制限されているが、
--   テーブル権限層でも最小権限に揃える多層防御を施す。
--
-- 対象（REVOKE ALL → 権限なし）:
--   認証ユーザー専用データのテーブル群。全 RLS ポリシーが auth.uid() を使用し、
--   anon 向けポリシーが存在しないため anon アクセスは不要。
--   - entries, records, split_times, team_memberships（Reviewer 指摘の4テーブル）
--   - announcements, app_daily_usage, calendar_view, goals, milestone_achievements,
--     milestones, practice_log_tags, practice_log_templates, practice_logs,
--     practice_tags, practice_times, practices, processed_webhook_events,
--     team_attendance, team_group_memberships, team_groups, teams,
--     token_consumption_log, user_sessions, user_subscriptions, users
--     （DB調査で同種の広すぎる GRANT が確認された追加テーブル）
--
-- 保持（意図的な anon アクセス）:
--   - styles: "Everyone can view styles" ポリシーが USING(true) + roles={public}。
--     public ロールは anon を包含するため anon SELECT が機能要件。
--     オンボーディング/ログイン前の種目選択で参照される。
--     → REVOKE しない（現状維持）
--   - contact_messages: "allow_anonymous_insert" ポリシーが TO anon で明示。
--     未認証ユーザーの問い合わせフォーム投稿に必要。
--     → INSERT のみ保持、不要な SELECT/UPDATE/DELETE/etc を REVOKE
--   - competitions: 直前の migration 20260705000000 で SELECT のみに制限済み。
--     → この migration では触らない
--
-- authenticated / service_role の GRANT は一切変更しない。
--
-- 冪等性: REVOKE は付与されていない権限にも安全に実行できるためエラーにならない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 認証ユーザー専用データ: anon の全権限を剥奪
-- -----------------------------------------------------------------------------

-- Reviewer 指摘の4テーブル（initial_schema.sql の明示的 GRANT ALL 由来）
REVOKE ALL ON TABLE "public"."entries" FROM "anon";
REVOKE ALL ON TABLE "public"."records" FROM "anon";
REVOKE ALL ON TABLE "public"."team_memberships" FROM "anon";
REVOKE ALL ON TABLE "public"."split_times" FROM "anon";

-- DB調査で確認された追加テーブル（同じく GRANT ALL または default privileges 由来）
REVOKE ALL ON TABLE "public"."announcements" FROM "anon";
REVOKE ALL ON TABLE "public"."app_daily_usage" FROM "anon";
REVOKE ALL ON TABLE "public"."calendar_view" FROM "anon";
REVOKE ALL ON TABLE "public"."goals" FROM "anon";
REVOKE ALL ON TABLE "public"."milestone_achievements" FROM "anon";
REVOKE ALL ON TABLE "public"."milestones" FROM "anon";
REVOKE ALL ON TABLE "public"."practice_log_tags" FROM "anon";
REVOKE ALL ON TABLE "public"."practice_log_templates" FROM "anon";
REVOKE ALL ON TABLE "public"."practice_logs" FROM "anon";
REVOKE ALL ON TABLE "public"."practice_tags" FROM "anon";
REVOKE ALL ON TABLE "public"."practice_times" FROM "anon";
REVOKE ALL ON TABLE "public"."practices" FROM "anon";
REVOKE ALL ON TABLE "public"."processed_webhook_events" FROM "anon";
REVOKE ALL ON TABLE "public"."team_attendance" FROM "anon";
REVOKE ALL ON TABLE "public"."team_group_memberships" FROM "anon";
REVOKE ALL ON TABLE "public"."team_groups" FROM "anon";
REVOKE ALL ON TABLE "public"."teams" FROM "anon";
REVOKE ALL ON TABLE "public"."token_consumption_log" FROM "anon";
REVOKE ALL ON TABLE "public"."user_sessions" FROM "anon";
REVOKE ALL ON TABLE "public"."user_subscriptions" FROM "anon";
REVOKE ALL ON TABLE "public"."users" FROM "anon";

-- competition_images: ローカルDBに現時点でテーブルが存在しないが、
-- add_competition_images.sql で GRANT SELECT TO anon が付与されている。
-- テーブルが存在する環境向けに REVOKE を記載する（存在しない場合は無害）。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'competition_images'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE public.competition_images FROM anon';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. contact_messages: INSERT のみ保持（問い合わせフォームの anon 投稿）
--    "allow_anonymous_insert" ポリシー (TO anon) が存在するため INSERT は必要。
--    SELECT/UPDATE/DELETE 等は不要なため剥奪し INSERT を明示再付与。
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE "public"."contact_messages" FROM "anon";
GRANT INSERT ON TABLE "public"."contact_messages" TO "anon";

-- -----------------------------------------------------------------------------
-- 3. styles: SELECT のみ保持（公開マスタデータ）
--    "Everyone can view styles" ポリシーが USING(true) + roles={public} であり、
--    {public} ロールは anon を包含するため anon SELECT が必要。
--    ただし RLS に SELECT のみのポリシーしかないため、
--    GRANT もテーブル権限層で SELECT のみに制限する（多層防御の一貫性）。
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE "public"."styles" FROM "anon";
GRANT SELECT ON TABLE "public"."styles" TO "anon";

-- -----------------------------------------------------------------------------
-- 4. DEFAULT PRIVILEGES の是正（root cause: 新規テーブルへの自動 GRANT ALL 防止）
--
--   initial_schema.sql:2249 に以下が存在する:
--     ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
--     GRANT ALL ON TABLES TO "anon";
--   これにより今後作成されるテーブルにも自動で anon GRANT ALL が付与される。
--
--   対処:
--     同じ grantor(postgres) に対して REVOKE を発行することで
--     今後の新規テーブルへの自動 GRANT ALL を無効化する。
--     supabase_admin が同様の DEFAULT PRIVILEGES を持つが、
--     supabase_admin が作成するテーブルはシステムテーブルであるため
--     postgres ロール分のみを是正する。
--
--   影響範囲:
--     - この REVOKE 以降に postgres ロールが作成する新規テーブルには
--       anon への自動 GRANT が付与されなくなる。
--     - 既存テーブルには影響しない（上記の個別 REVOKE で対処済み）。
--     - authenticated / service_role の DEFAULT PRIVILEGES は変更しない。
-- -----------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON TABLES FROM "anon";

-- 明示的に最小権限を再設定（今後の新規テーブルには anon 権限なし）
-- ※ authenticated と service_role は既存の DEFAULT PRIVILEGES で維持される
