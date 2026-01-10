
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

-- Drop all existing tables if they exist (CASCADE to handle foreign key constraints)
DROP TABLE IF EXISTS "public"."practice_log_tags" CASCADE;
DROP TABLE IF EXISTS "public"."practice_times" CASCADE;
DROP TABLE IF EXISTS "public"."practice_logs" CASCADE;
DROP TABLE IF EXISTS "public"."split_times" CASCADE;
DROP TABLE IF EXISTS "public"."group_assignments" CASCADE;
DROP TABLE IF EXISTS "public"."team_attendance" CASCADE;
DROP TABLE IF EXISTS "public"."entries" CASCADE;
DROP TABLE IF EXISTS "public"."records" CASCADE;
DROP TABLE IF EXISTS "public"."announcements" CASCADE;
DROP TABLE IF EXISTS "public"."team_groups" CASCADE;
DROP TABLE IF EXISTS "public"."team_memberships" CASCADE;
DROP TABLE IF EXISTS "public"."competitions" CASCADE;
DROP TABLE IF EXISTS "public"."practices" CASCADE;
DROP TABLE IF EXISTS "public"."practice_tags" CASCADE;
DROP TABLE IF EXISTS "public"."user_sessions" CASCADE;
DROP TABLE IF EXISTS "public"."teams" CASCADE;
DROP TABLE IF EXISTS "public"."users" CASCADE;
DROP TABLE IF EXISTS "public"."styles" CASCADE;

-- Drop functions if they exist
DROP FUNCTION IF EXISTS "public"."update_best_times"() CASCADE;

-- Drop types if they exist
DROP TYPE IF EXISTS "public"."attendance_status_type" CASCADE;
DROP TYPE IF EXISTS "public"."entry_status_type" CASCADE;
DROP TYPE IF EXISTS "public"."membership_status_type" CASCADE;
DROP TYPE IF EXISTS "public"."swim_category_enum" CASCADE;

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE TYPE "public"."attendance_status_type" AS ENUM (
    'open',
    'closed'
);

ALTER TYPE "public"."attendance_status_type" OWNER TO "postgres";

CREATE TYPE "public"."entry_status_type" AS ENUM (
    'before',
    'open',
    'closed'
);

ALTER TYPE "public"."entry_status_type" OWNER TO "postgres";

CREATE TYPE "public"."membership_status_type" AS ENUM (
    'pending',
    'approved',
    'rejected'
);

ALTER TYPE "public"."membership_status_type" OWNER TO "postgres";

CREATE TYPE "public"."swim_category_enum" AS ENUM ('Swim', 'Pull', 'Kick');

ALTER TYPE "public"."swim_category_enum" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_attendance_for_team_competition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO team_attendance (competition_id, user_id, status)
    SELECT NEW.id, tm.user_id, NULL
    FROM team_memberships tm
    WHERE tm.team_id = NEW.team_id
    AND tm.is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."create_attendance_for_team_competition"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_attendance_for_team_practice"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO team_attendance (practice_id, user_id, status)
    SELECT NEW.id, tm.user_id, NULL
    FROM team_memberships tm
    WHERE tm.team_id = NEW.team_id
    AND tm.is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."create_attendance_for_team_practice"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  RETURN upper(substring(md5(random()::text) from 1 for 8));
END;
$$;

ALTER FUNCTION "public"."generate_invite_code"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  INSERT INTO public.users (id, name, gender, birthday, profile_image_path, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'gender')::INTEGER, 0), -- デフォルト: 0 (male)
    NULL,
    NULL, -- プロフィール画像は後でアップロード
    NULL
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."replace_practice_log_tags"("p_practice_log_id" "uuid", "p_tag_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  -- 既存のタグをすべて削除
  DELETE FROM practice_log_tags
  WHERE practice_log_id = p_practice_log_id;

  -- 新しいタグを挿入（空の配列の場合は何もしない）
  IF array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO practice_log_tags (practice_log_id, practice_tag_id)
    SELECT p_practice_log_id, unnest(p_tag_ids);
  END IF;
END;
$$;

ALTER FUNCTION "public"."replace_practice_log_tags"("p_practice_log_id" "uuid", "p_tag_ids" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_team_member"("target_team_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = target_team_id
      AND tm.user_id = target_user_id
      AND tm.is_active = true
  );
$$;

COMMENT ON FUNCTION "public"."is_team_member"("target_team_id" "uuid", "target_user_id" "uuid") IS '指定したユーザーがチームに所属しているかを判定する（RLS回避用）';

-- invite_codeでチームを安全に検索する関数
-- 認証されたユーザーが特定のinvite_codeでチームを検索できる
-- セキュリティのため、idとinvite_codeのみを返す
CREATE OR REPLACE FUNCTION "public"."find_team_by_invite_code"("p_invite_code" "text")
RETURNS TABLE("id" "uuid", "invite_code" "text")
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  -- 認証チェック
  IF (SELECT "auth"."uid"()) IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;
  
  -- invite_codeに一致するチームを返す（idとinvite_codeのみ）
  RETURN QUERY
  SELECT 
    t.id,
    t.invite_code
  FROM public.teams t
  WHERE t.invite_code = p_invite_code
  LIMIT 1;
END;
$$;

ALTER FUNCTION "public"."find_team_by_invite_code"("p_invite_code" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."find_team_by_invite_code"("p_invite_code" "text") IS 'invite_codeでチームを安全に検索する。認証されたユーザーのみが使用でき、idとinvite_codeのみを返す。';

CREATE OR REPLACE FUNCTION "public"."is_team_admin"("target_team_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = target_team_id
      AND tm.user_id = target_user_id
      AND tm.is_active = true
      AND tm.role = 'admin'
  );
$$;

COMMENT ON FUNCTION "public"."is_team_admin"("target_team_id" "uuid", "target_user_id" "uuid") IS '指定したユーザーがチーム管理者かどうかを判定する（RLS回避用）';

CREATE OR REPLACE FUNCTION "public"."shares_active_team"("target_user_id" "uuid", "viewer_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm_target
    JOIN public.team_memberships tm_viewer
      ON tm_target.team_id = tm_viewer.team_id
    WHERE tm_target.user_id = target_user_id
      AND tm_viewer.user_id = viewer_user_id
      AND tm_target.is_active = true
      AND tm_viewer.is_active = true
  );
$$;

COMMENT ON FUNCTION "public"."shares_active_team"("target_user_id" "uuid", "viewer_user_id" "uuid") IS '2人のユーザーが同じチームにアクティブ所属しているかを判定する';

COMMENT ON FUNCTION "public"."replace_practice_log_tags"("p_practice_log_id" "uuid", "p_tag_ids" "uuid"[]) IS 'practice_log_tags を原子性のある操作で置き換える。既存のタグを削除してから新しいタグを挿入する。';

CREATE OR REPLACE FUNCTION "public"."replace_practice_logs"(
  "p_practice_id" "uuid",
  "p_logs_data" "jsonb"
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_log_data jsonb;
  v_practice_log_id uuid;
  v_time_data jsonb;
  v_tag_id uuid;
  v_result jsonb;
  v_error_message text;
  v_index integer := 0;
  v_swim_category "public"."swim_category_enum";
BEGIN
  -- トランザクション開始（関数全体が自動的にトランザクション内で実行される）
  
  -- 入力データのバリデーション
  -- 1. p_logs_dataが配列であることを確認
  IF jsonb_typeof(p_logs_data) != 'array' THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'p_logs_data must be a JSON array',
      'field', 'p_logs_data',
      'index', -1
    );
    RETURN v_result;
  END IF;
  
  -- 2. 配列が空でないことを確認
  IF jsonb_array_length(p_logs_data) = 0 THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'p_logs_data must be a non-empty array',
      'field', 'p_logs_data',
      'index', -1
    );
    RETURN v_result;
  END IF;
  
  -- 既存のpractice_logsと関連データを削除
  -- CASCADEにより、practice_timesとpractice_log_tagsも自動削除される
  DELETE FROM practice_logs
  WHERE practice_id = p_practice_id;
  
  -- 新しいログデータを挿入
  FOR v_log_data IN SELECT * FROM jsonb_array_elements(p_logs_data)
  LOOP
    -- 各エントリのバリデーション
    -- user_idの存在と型チェック
    IF v_log_data->'user_id' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'user_id is required',
        'field', 'user_id',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    IF jsonb_typeof(v_log_data->'user_id') != 'string' THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'user_id must be a string',
        'field', 'user_id',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    -- user_idがUUIDに変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'user_id')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'user_id must be a valid UUID',
          'field', 'user_id',
          'index', v_index
        );
        RETURN v_result;
    END;
    
    -- styleの存在と型チェック
    IF v_log_data->'style' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'style is required',
        'field', 'style',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    IF jsonb_typeof(v_log_data->'style') != 'string' THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'style must be a string',
        'field', 'style',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    -- swim_categoryのバリデーション（オプショナル、デフォルト'Swim'）
    IF v_log_data->'swim_category' IS NULL THEN
      v_swim_category := 'Swim';
    ELSIF jsonb_typeof(v_log_data->'swim_category') != 'string' THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'swim_category must be a string',
        'field', 'swim_category',
        'index', v_index
      );
      RETURN v_result;
    ELSE
      -- enum値の検証
      IF v_log_data->>'swim_category' NOT IN ('Swim', 'Pull', 'Kick') THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'swim_category must be one of: Swim, Pull, Kick',
          'field', 'swim_category',
          'index', v_index
        );
        RETURN v_result;
      END IF;
      v_swim_category := (v_log_data->>'swim_category')::"public"."swim_category_enum";
    END IF;
    
    -- rep_countの存在と型チェック
    IF v_log_data->'rep_count' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'rep_count is required',
        'field', 'rep_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    IF jsonb_typeof(v_log_data->'rep_count') NOT IN ('number', 'string') THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'rep_count must be a number or numeric string',
        'field', 'rep_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    -- rep_countが整数に変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'rep_count')::integer;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'rep_count must be a valid integer',
          'field', 'rep_count',
          'index', v_index
        );
        RETURN v_result;
    END;
    
    -- set_countの存在と型チェック
    IF v_log_data->'set_count' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'set_count is required',
        'field', 'set_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    IF jsonb_typeof(v_log_data->'set_count') NOT IN ('number', 'string') THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'set_count must be a number or numeric string',
        'field', 'set_count',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    -- set_countが整数に変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'set_count')::integer;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'set_count must be a valid integer',
          'field', 'set_count',
          'index', v_index
        );
        RETURN v_result;
    END;
    
    -- distanceの存在と型チェック
    IF v_log_data->'distance' IS NULL THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'distance is required',
        'field', 'distance',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    IF jsonb_typeof(v_log_data->'distance') NOT IN ('number', 'string') THEN
      v_result := jsonb_build_object(
        'success', false,
        'error', 'distance must be a number or numeric string',
        'field', 'distance',
        'index', v_index
      );
      RETURN v_result;
    END IF;
    
    -- distanceが整数に変換可能か確認
    BEGIN
      PERFORM (v_log_data->>'distance')::integer;
    EXCEPTION
      WHEN OTHERS THEN
        v_result := jsonb_build_object(
          'success', false,
          'error', 'distance must be a valid integer',
          'field', 'distance',
          'index', v_index
        );
        RETURN v_result;
    END;
    
    -- practice_logsを挿入
    INSERT INTO practice_logs (
      practice_id,
      user_id,
      style,
      swim_category,
      rep_count,
      set_count,
      distance,
      note
    ) VALUES (
      p_practice_id,
      (v_log_data->>'user_id')::uuid,
      v_log_data->>'style',
      v_swim_category,
      (v_log_data->>'rep_count')::integer,
      (v_log_data->>'set_count')::integer,
      (v_log_data->>'distance')::integer,
      NULLIF(v_log_data->>'note', '')
    )
    RETURNING id INTO v_practice_log_id;
    
    -- practice_timesを挿入（存在する場合）
    IF v_log_data->'practice_times' IS NOT NULL AND jsonb_array_length(v_log_data->'practice_times') > 0 THEN
      FOR v_time_data IN SELECT * FROM jsonb_array_elements(v_log_data->'practice_times')
      LOOP
        INSERT INTO practice_times (
          practice_log_id,
          user_id,
          set_number,
          rep_number,
          time
        ) VALUES (
          v_practice_log_id,
          (v_log_data->>'user_id')::uuid,
          (v_time_data->>'set_number')::integer,
          (v_time_data->>'rep_number')::integer,
          (v_time_data->>'time')::numeric
        );
      END LOOP;
    END IF;
    
    -- practice_log_tagsを挿入（存在する場合）
    IF v_log_data->'tag_ids' IS NOT NULL AND jsonb_array_length(v_log_data->'tag_ids') > 0 THEN
      FOR v_tag_id IN SELECT value::uuid FROM jsonb_array_elements_text(v_log_data->'tag_ids')
      LOOP
        INSERT INTO practice_log_tags (
          practice_log_id,
          practice_tag_id
        ) VALUES (
          v_practice_log_id,
          v_tag_id
        );
      END LOOP;
    END IF;
    
    -- インデックスをインクリメント
    v_index := v_index + 1;
  END LOOP;
  
  -- 成功レスポンスを返す
  v_result := jsonb_build_object(
    'success', true,
    'message', '練習ログを正常に保存しました'
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- エラーが発生した場合、ロールバックされ、エラーレスポンスを返す
    v_error_message := SQLERRM;
    v_result := jsonb_build_object(
      'success', false,
      'error', v_error_message
    );
    RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") IS 'practice_logsを原子性のある操作で置き換える。既存のログを削除してから新しいログを挿入する。トランザクション内で実行されるため、エラー時は自動的にロールバックされる。swim_categoryフィールドをサポート。';

CREATE OR REPLACE FUNCTION "public"."set_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_invite_code"() OWNER TO "postgres";

-- 承認待ちのメンバーシップから招待コードを取得するRPC関数
-- 自分のメンバーシップ（user_id = auth.uid()）の招待コードのみ取得可能
CREATE OR REPLACE FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid")
RETURNS "text"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_invite_code text;
BEGIN
  -- 認証チェック
  IF (SELECT "auth"."uid"()) IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;
  
  -- 自分のメンバーシップが存在するかチェック（承認待ちでも可）
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = (SELECT "auth"."uid"())
  ) THEN
    RAISE EXCEPTION 'チームへのアクセス権限がありません';
  END IF;
  
  -- 招待コードを取得
  SELECT t.invite_code INTO v_invite_code
  FROM public.teams t
  WHERE t.id = p_team_id
  LIMIT 1;
  
  RETURN v_invite_code;
END;
$$;

ALTER FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") IS '承認待ちのメンバーシップからも招待コードを取得できる。自分のメンバーシップ（user_id = auth.uid()）が存在する場合のみ取得可能。';

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "is_published" boolean DEFAULT false,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "announcements_end_at_check" CHECK (("end_at" IS NULL) OR ("start_at" IS NULL) OR ("end_at" >= "start_at"))
);

ALTER TABLE "public"."announcements" OWNER TO "postgres";

COMMENT ON COLUMN "public"."announcements"."start_at" IS '表示開始日時（NULLの場合は期間制限なし）';
COMMENT ON COLUMN "public"."announcements"."end_at" IS '表示終了日時（NULLの場合は期間制限なし）';

CREATE TABLE "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "date" "date" NOT NULL,
    "end_date" "date",
    "place" "text",
    "pool_type" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "created_by" "uuid",
    "user_id" "uuid",
    "entry_status" "public"."entry_status_type" DEFAULT 'before'::"public"."entry_status_type" NOT NULL,
    "attendance_status" "public"."attendance_status_type" DEFAULT 'open'::"public"."attendance_status_type",
    CONSTRAINT "competitions_pool_type_check" CHECK (("pool_type" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "competitions_end_date_check" CHECK (("end_date" IS NULL) OR ("end_date" >= "date"))
);

ALTER TABLE "public"."competitions" OWNER TO "postgres";

COMMENT ON COLUMN "public"."competitions"."title" IS '大会名（NULLの場合は「大会」と表示）';

COMMENT ON COLUMN "public"."competitions"."entry_status" IS 'エントリーステータス: before=エントリー前, open=エントリー受付中, closed=エントリー締切';

COMMENT ON COLUMN "public"."competitions"."attendance_status" IS '出欠提出ステータス: open=提出受付中, closed=提出締切';

COMMENT ON COLUMN "public"."competitions"."end_date" IS '大会終了日（複数日開催の場合）。NULLの場合は単日開催。';

CREATE TABLE "public"."entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "competition_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "style_id" integer NOT NULL,
    "entry_time" numeric(10,2),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."entries" OWNER TO "postgres";

COMMENT ON TABLE "public"."entries" IS '大会エントリー情報（個人・チーム共通）';

COMMENT ON COLUMN "public"."entries"."team_id" IS 'チームID（NULL=個人エントリー）';

COMMENT ON COLUMN "public"."entries"."competition_id" IS '大会ID';

COMMENT ON COLUMN "public"."entries"."user_id" IS 'エントリーしたユーザーID';

COMMENT ON COLUMN "public"."entries"."style_id" IS '種目ID';

COMMENT ON COLUMN "public"."entries"."entry_time" IS 'エントリータイム（秒）';

COMMENT ON COLUMN "public"."entries"."note" IS 'メモ・備考';

CREATE TABLE "public"."practice_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "practice_id" "uuid" NOT NULL,
    "style" "text" NOT NULL,
    "swim_category" "public"."swim_category_enum" DEFAULT 'Swim'::"public"."swim_category_enum" NOT NULL,
    "rep_count" integer NOT NULL,
    "set_count" integer NOT NULL,
    "distance" integer NOT NULL,
    "circle" numeric(10,2),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_logs" OWNER TO "postgres";

COMMENT ON COLUMN "public"."practice_logs"."swim_category" IS '泳法カテゴリ: Swim=通常泳法, Pull=プル, Kick=キック';

CREATE TABLE "public"."practices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "title" "text",
    "place" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "created_by" "uuid",
    "attendance_status" "public"."attendance_status_type" DEFAULT 'open'::"public"."attendance_status_type"
);

ALTER TABLE "public"."practices" OWNER TO "postgres";

COMMENT ON COLUMN "public"."practices"."title" IS '練習タイトル（NULLの場合は「練習」と表示）';

COMMENT ON COLUMN "public"."practices"."attendance_status" IS '出欠提出ステータス: open=提出受付中, closed=提出締切';

CREATE TABLE "public"."records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "competition_id" "uuid",
    "style_id" integer NOT NULL,
    "time" numeric(10,2) NOT NULL,
    "pool_type" smallint NOT NULL,
    "reaction_time" numeric(10,2),
    "video_url" "text",
    "note" "text",
    "is_relaying" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid"
);

ALTER TABLE "public"."records" OWNER TO "postgres";

COMMENT ON COLUMN "public"."records"."pool_type" IS '0: 短水路(25m), 1: 長水路(50m)';

COMMENT ON COLUMN "public"."records"."reaction_time" IS '反応時間（リアクションタイム）を秒単位で記録。範囲は0.40~1.00秒程度。';

CREATE TABLE "public"."team_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "status" "public"."membership_status_type" DEFAULT 'pending'::"public"."membership_status_type" NOT NULL,
    "member_type" "text",
    "group_name" "text",
    "joined_at" "date" DEFAULT CURRENT_DATE,
    "left_at" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_memberships_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'user'::"text"]))),
    CONSTRAINT "team_memberships_member_type_check" CHECK ((("member_type" IS NULL) OR ("member_type" = ANY (ARRAY['swimmer'::"text", 'coach'::"text", 'director'::"text", 'manager'::"text"]))))
);

ALTER TABLE "public"."team_memberships" OWNER TO "postgres";

COMMENT ON COLUMN "public"."team_memberships"."status" IS 'メンバーシップの承認ステータス: pending=承認待ち, approved=承認済み, rejected=拒否';

CREATE TABLE "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "invite_code" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."teams" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."calendar_view" WITH ("security_invoker"='true') AS
-- 個人練習（練習ログなし）
SELECT "p"."id",
    'practice'::"text" AS "item_type",
    "p"."date" AS "item_date",
    COALESCE("p"."title", '練習'::"text") AS "title",
    "p"."place",
    "p"."note",
    "jsonb_build_object"('practice', "to_jsonb"("p".*), 'user_id', "p"."user_id") AS "metadata"
  FROM "public"."practices" "p"
  WHERE (("p"."user_id" = (SELECT "auth"."uid"())) AND ("p"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."practice_logs" "pl"
          WHERE ("pl"."practice_id" = "p"."id")))))
UNION ALL
-- チーム練習（練習ログなし）
SELECT "p"."id",
    'team_practice'::"text" AS "item_type",
    "p"."date" AS "item_date",
    COALESCE("p"."title", 'チーム練習'::"text") AS "title",
    "p"."place",
    "p"."note",
    "jsonb_build_object"('practice', "to_jsonb"("p".*), 'user_id', "p"."user_id", 'team_id', "p"."team_id", 'team', "to_jsonb"("t".*)) AS "metadata"
  FROM ("public"."practices" "p"
    JOIN "public"."teams" "t" ON (("t"."id" = "p"."team_id")))
  WHERE (("p"."team_id" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."practice_logs" "pl"
          WHERE ("pl"."practice_id" = "p"."id")))) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "p"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))))
UNION ALL
-- 個人練習ログ
SELECT "pl"."id",
    'practice_log'::"text" AS "item_type",
    "p"."date" AS "item_date",
        CASE
            WHEN ("pl"."set_count" = 1) THEN (((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本'::"text")
            ELSE (((((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本 × '::"text") || ("pl"."set_count")::"text") || 'セット'::"text")
        END AS "title",
    "p"."place",
    "pl"."note",
    "jsonb_build_object"('practice_log', "to_jsonb"("pl".*), 'practice', "to_jsonb"("p".*), 'user_id', "pl"."user_id") AS "metadata"
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."user_id" = (SELECT "auth"."uid"())) AND ("p"."team_id" IS NULL))
UNION ALL
-- チーム練習ログ
SELECT "pl"."id",
    'practice_log'::"text" AS "item_type",
    "p"."date" AS "item_date",
        CASE
            WHEN ("pl"."set_count" = 1) THEN (((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本'::"text")
            ELSE (((((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本 × '::"text") || ("pl"."set_count")::"text") || 'セット'::"text")
        END AS "title",
    "p"."place",
    "pl"."note",
    "jsonb_build_object"('practice_log', "to_jsonb"("pl".*), 'practice', "to_jsonb"("p".*), 'user_id', "pl"."user_id", 'team_id', "p"."team_id", 'team', "to_jsonb"("t".*)) AS "metadata"
  FROM (("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
    JOIN "public"."teams" "t" ON (("t"."id" = "p"."team_id")))
  WHERE (("p"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "p"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))))
UNION ALL
-- 個人大会（記録・エントリーなし）- 複数日展開対応
SELECT "c"."id",
    'competition'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    COALESCE("c"."title", '大会'::"text") AS "title",
    "c"."place",
    "c"."note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM "public"."competitions" "c"
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."user_id" = (SELECT "auth"."uid"())) AND ("c"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"())))))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = (SELECT "auth"."uid"())) AND ("e"."team_id" IS NULL))))))
UNION ALL
-- チーム大会（記録・エントリーなし）- 複数日展開対応
SELECT "c"."id",
    'team_competition'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    COALESCE("c"."title", '大会'::"text") AS "title",
    "c"."place",
    "c"."note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE ("r"."competition_id" = "c"."id")))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."team_id" IS NOT NULL))))))
UNION ALL
-- 個人エントリー（記録なし）- 複数日展開対応
SELECT "c"."id",
    'entry'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    COALESCE("c"."title", '大会'::"text") AS "title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM "public"."competitions" "c"
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."user_id" = (SELECT "auth"."uid"())) AND ("c"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"())))))) AND (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = (SELECT "auth"."uid"())) AND ("e"."team_id" IS NULL)))))
UNION ALL
-- チームエントリー（記録なし）- 複数日展開対応
SELECT "c"."id",
    'entry'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    COALESCE("c"."title", '大会'::"text") AS "title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE ("r"."competition_id" = "c"."id")))) AND (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."team_id" IS NOT NULL)))))
UNION ALL
-- 個人記録 - 複数日展開対応
SELECT "c"."id",
    'record'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    COALESCE("c"."title", '大会'::"text") AS "title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM "public"."competitions" "c"
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."user_id" = (SELECT "auth"."uid"())) AND ("c"."team_id" IS NULL) AND (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"()))))))
UNION ALL
-- チーム記録 - 複数日展開対応
SELECT "c"."id",
    'record'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    COALESCE("c"."title", '大会'::"text") AS "title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))) AND (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE ("r"."competition_id" = "c"."id"))));

ALTER VIEW "public"."calendar_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."calendar_view" IS 'カレンダー表示用の統合ビュー（練習、練習ログ、大会、エントリー、記録を含む）。placeカラムで統一。複数日開催の大会は各日に展開される。チームのcompetition/recordは、チームメンバーであれば誰が登録したものでも表示される。titleがnullの場合はデフォルト値（練習/大会）を表示。';

CREATE TABLE "public"."group_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."group_assignments" OWNER TO "postgres";

CREATE TABLE "public"."practice_log_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "practice_log_id" "uuid" NOT NULL,
    "practice_tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_log_tags" OWNER TO "postgres";

CREATE TABLE "public"."practice_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#3B82F6'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_tags" OWNER TO "postgres";

CREATE TABLE "public"."practice_times" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "practice_log_id" "uuid" NOT NULL,
    "rep_number" integer NOT NULL,
    "set_number" integer NOT NULL,
    "time" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_times" OWNER TO "postgres";

CREATE TABLE "public"."split_times" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid" NOT NULL,
    "distance" integer NOT NULL,
    "split_time" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."split_times" OWNER TO "postgres";

CREATE TABLE "public"."styles" (
    "id" integer NOT NULL,
    "name_jp" "text" NOT NULL,
    "name" "text" NOT NULL,
    "style" "text" NOT NULL,
    "distance" integer NOT NULL,
    CONSTRAINT "styles_style_check" CHECK (("style" = ANY (ARRAY['fr'::"text", 'br'::"text", 'ba'::"text", 'fly'::"text", 'im'::"text"])))
);

ALTER TABLE "public"."styles" OWNER TO "postgres";

CREATE TABLE "public"."team_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "practice_id" "uuid",
    "competition_id" "uuid",
    CONSTRAINT "team_attendance_event_check" CHECK (((("practice_id" IS NOT NULL) AND ("competition_id" IS NULL)) OR (("practice_id" IS NULL) AND ("competition_id" IS NOT NULL)))),
    CONSTRAINT "team_attendance_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'other'::"text"]))))
);

ALTER TABLE "public"."team_attendance" OWNER TO "postgres";

CREATE TABLE "public"."team_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."team_groups" OWNER TO "postgres";

CREATE TABLE "public"."user_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "user_id" "uuid",
    "user_agent" "text",
    "ip_address" "inet",
    "expires_at" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_activity" timestamp with time zone DEFAULT "now"(),
    "created_at_ts" timestamp with time zone DEFAULT "now"(),
    "updated_at_ts" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."user_sessions" OWNER TO "postgres";

CREATE TABLE "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "gender" integer DEFAULT 0 NOT NULL,
    "birthday" "date",
    "profile_image_path" "text",
    "bio" "text",
    "google_calendar_enabled" boolean DEFAULT false NOT NULL,
    "google_calendar_refresh_token" "text",
    "google_calendar_sync_practices" boolean DEFAULT true NOT NULL,
    "google_calendar_sync_competitions" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "users_gender_check" CHECK (("gender" = ANY (ARRAY[0, 1])))
);

ALTER TABLE "public"."users" OWNER TO "postgres";

COMMENT ON COLUMN "public"."users"."google_calendar_enabled" IS 'Googleカレンダー連携が有効かどうか';

COMMENT ON COLUMN "public"."users"."google_calendar_refresh_token" IS 'Google OAuthリフレッシュトークン（暗号化推奨）';

COMMENT ON COLUMN "public"."users"."google_calendar_sync_practices" IS '練習記録をGoogleカレンダーに同期するかどうか';

COMMENT ON COLUMN "public"."users"."google_calendar_sync_competitions" IS '大会記録をGoogleカレンダーに同期するかどうか';

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_competition_id_user_id_style_id_key" UNIQUE ("competition_id", "user_id", "style_id");

ALTER TABLE ONLY "public"."group_assignments"
    ADD CONSTRAINT "group_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."group_assignments"
    ADD CONSTRAINT "group_assignments_team_group_id_user_id_key" UNIQUE ("team_group_id", "user_id");

ALTER TABLE ONLY "public"."practice_log_tags"
    ADD CONSTRAINT "practice_log_tags_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."practice_log_tags"
    ADD CONSTRAINT "practice_log_tags_practice_log_id_practice_tag_id_key" UNIQUE ("practice_log_id", "practice_tag_id");

ALTER TABLE ONLY "public"."practice_logs"
    ADD CONSTRAINT "practice_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."practice_tags"
    ADD CONSTRAINT "practice_tags_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."practice_tags"
    ADD CONSTRAINT "practice_tags_user_id_name_key" UNIQUE ("user_id", "name");

ALTER TABLE ONLY "public"."practice_times"
    ADD CONSTRAINT "practice_times_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."practices"
    ADD CONSTRAINT "practices_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."split_times"
    ADD CONSTRAINT "split_times_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."styles"
    ADD CONSTRAINT "styles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."team_attendance"
    ADD CONSTRAINT "team_attendance_competition_user_unique" UNIQUE ("competition_id", "user_id");

ALTER TABLE ONLY "public"."team_attendance"
    ADD CONSTRAINT "team_attendance_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."team_attendance"
    ADD CONSTRAINT "team_attendance_practice_user_unique" UNIQUE ("practice_id", "user_id");

ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "team_entries_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."team_groups"
    ADD CONSTRAINT "team_groups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."team_groups"
    ADD CONSTRAINT "team_groups_team_id_name_key" UNIQUE ("team_id", "name");

ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_team_id_user_id_key" UNIQUE ("team_id", "user_id");

ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_invite_code_key" UNIQUE ("invite_code");

ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_session_id_key" UNIQUE ("session_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_announcements_created_by" ON "public"."announcements" USING "btree" ("created_by");

CREATE INDEX "idx_announcements_is_published" ON "public"."announcements" USING "btree" ("is_published");

CREATE INDEX "idx_announcements_start_at" ON "public"."announcements" USING "btree" ("start_at");

CREATE INDEX "idx_announcements_end_at" ON "public"."announcements" USING "btree" ("end_at");

CREATE INDEX "idx_announcements_team_id" ON "public"."announcements" USING "btree" ("team_id");

CREATE INDEX "idx_competitions_attendance_status" ON "public"."competitions" USING "btree" ("attendance_status");

CREATE INDEX "idx_competitions_created_at" ON "public"."competitions" USING "btree" ("created_at");

CREATE INDEX "idx_competitions_date" ON "public"."competitions" USING "btree" ("date");

CREATE INDEX "idx_competitions_end_date" ON "public"."competitions" USING "btree" ("end_date");

CREATE INDEX "idx_competitions_team_id" ON "public"."competitions" USING "btree" ("team_id");

CREATE INDEX "idx_competitions_team_id_entry_status" ON "public"."competitions" USING "btree" ("team_id", "entry_status") WHERE ("team_id" IS NOT NULL);

CREATE INDEX "idx_competitions_title" ON "public"."competitions" USING "btree" ("title");

CREATE INDEX "idx_competitions_updated_at" ON "public"."competitions" USING "btree" ("updated_at");

CREATE INDEX "idx_competitions_user_id" ON "public"."competitions" USING "btree" ("user_id");

CREATE INDEX "idx_entries_competition_id" ON "public"."entries" USING "btree" ("competition_id");

CREATE INDEX "idx_entries_style_id" ON "public"."entries" USING "btree" ("style_id");

CREATE INDEX "idx_entries_team_id" ON "public"."entries" USING "btree" ("team_id");

CREATE INDEX "idx_entries_user_id" ON "public"."entries" USING "btree" ("user_id");

CREATE INDEX "idx_group_assignments_team_group_id" ON "public"."group_assignments" USING "btree" ("team_group_id");

CREATE INDEX "idx_group_assignments_user_id" ON "public"."group_assignments" USING "btree" ("user_id");

CREATE INDEX "idx_practice_log_tags_practice_log_id" ON "public"."practice_log_tags" USING "btree" ("practice_log_id");

CREATE INDEX "idx_practice_log_tags_practice_tag_id" ON "public"."practice_log_tags" USING "btree" ("practice_tag_id");

CREATE INDEX "idx_practice_log_tags_updated_at" ON "public"."practice_log_tags" USING "btree" ("updated_at");

CREATE INDEX "idx_practice_logs_practice_id" ON "public"."practice_logs" USING "btree" ("practice_id");

CREATE INDEX "idx_practice_logs_style" ON "public"."practice_logs" USING "btree" ("style");

CREATE INDEX "idx_practice_logs_user_id" ON "public"."practice_logs" USING "btree" ("user_id");

CREATE INDEX "idx_practice_tags_name" ON "public"."practice_tags" USING "btree" ("name");

CREATE INDEX "idx_practice_tags_user_id" ON "public"."practice_tags" USING "btree" ("user_id");

CREATE INDEX "idx_practice_times_practice_log_id" ON "public"."practice_times" USING "btree" ("practice_log_id");

CREATE INDEX "idx_practice_times_rep_set" ON "public"."practice_times" USING "btree" ("rep_number", "set_number");

CREATE INDEX "idx_practices_attendance_status" ON "public"."practices" USING "btree" ("attendance_status");

CREATE INDEX "idx_practices_date" ON "public"."practices" USING "btree" ("date");

CREATE INDEX "idx_practices_team_id" ON "public"."practices" USING "btree" ("team_id");

CREATE INDEX "idx_practices_user_date" ON "public"."practices" USING "btree" ("user_id", "date");

CREATE INDEX "idx_practices_user_id" ON "public"."practices" USING "btree" ("user_id");

CREATE INDEX "idx_records_competition_id" ON "public"."records" USING "btree" ("competition_id");

CREATE INDEX "idx_records_created_at" ON "public"."records" USING "btree" ("created_at");

CREATE INDEX "idx_records_is_relaying" ON "public"."records" USING "btree" ("is_relaying");

CREATE INDEX "idx_records_style_id" ON "public"."records" USING "btree" ("style_id");

CREATE INDEX "idx_records_team_id" ON "public"."records" USING "btree" ("team_id");

CREATE INDEX "idx_records_time" ON "public"."records" USING "btree" ("time");

CREATE INDEX "idx_records_updated_at" ON "public"."records" USING "btree" ("updated_at");

CREATE INDEX "idx_records_user_id" ON "public"."records" USING "btree" ("user_id");

CREATE INDEX "idx_records_user_style_relaying" ON "public"."records" USING "btree" ("user_id", "style_id", "is_relaying");

CREATE INDEX "idx_split_times_created_at" ON "public"."split_times" USING "btree" ("created_at");

CREATE INDEX "idx_split_times_distance" ON "public"."split_times" USING "btree" ("distance");

CREATE INDEX "idx_split_times_record_id" ON "public"."split_times" USING "btree" ("record_id");

CREATE INDEX "idx_split_times_updated_at" ON "public"."split_times" USING "btree" ("updated_at");

CREATE INDEX "idx_team_attendance_competition_id" ON "public"."team_attendance" USING "btree" ("competition_id");

CREATE INDEX "idx_team_attendance_practice_id" ON "public"."team_attendance" USING "btree" ("practice_id");

CREATE INDEX "idx_team_attendance_status" ON "public"."team_attendance" USING "btree" ("status");

CREATE INDEX "idx_team_attendance_user_id" ON "public"."team_attendance" USING "btree" ("user_id");

CREATE INDEX "idx_team_groups_created_by" ON "public"."team_groups" USING "btree" ("created_by");

CREATE INDEX "idx_team_groups_team_id" ON "public"."team_groups" USING "btree" ("team_id");

CREATE INDEX "idx_team_memberships_is_active" ON "public"."team_memberships" USING "btree" ("is_active");

CREATE INDEX "idx_team_memberships_joined_at" ON "public"."team_memberships" USING "btree" ("joined_at");

CREATE INDEX "idx_team_memberships_role" ON "public"."team_memberships" USING "btree" ("role");

CREATE INDEX "idx_team_memberships_team_id" ON "public"."team_memberships" USING "btree" ("team_id");

CREATE INDEX "idx_team_memberships_user_id" ON "public"."team_memberships" USING "btree" ("user_id");

CREATE INDEX "idx_team_memberships_status" ON "public"."team_memberships" USING "btree" ("status");

CREATE INDEX "idx_team_memberships_team_status" ON "public"."team_memberships" USING "btree" ("team_id", "status");

CREATE INDEX "idx_teams_created_at" ON "public"."teams" USING "btree" ("created_at");

CREATE INDEX "idx_teams_created_by" ON "public"."teams" USING "btree" ("created_by");

CREATE INDEX "idx_teams_invite_code" ON "public"."teams" USING "btree" ("invite_code");

CREATE INDEX "idx_user_sessions_expires_at" ON "public"."user_sessions" USING "btree" ("expires_at");

CREATE INDEX "idx_user_sessions_session_id" ON "public"."user_sessions" USING "btree" ("session_id");

CREATE INDEX "idx_user_sessions_updated_at" ON "public"."user_sessions" USING "btree" ("updated_at");

CREATE INDEX "idx_user_sessions_user_id" ON "public"."user_sessions" USING "btree" ("user_id");

CREATE INDEX "idx_users_gender" ON "public"."users" USING "btree" ("gender");

CREATE INDEX "idx_users_name" ON "public"."users" USING "btree" ("name");

DROP TRIGGER IF EXISTS "create_attendance_on_team_competition" ON "public"."competitions";
CREATE TRIGGER "create_attendance_on_team_competition" AFTER INSERT ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."create_attendance_for_team_competition"();

DROP TRIGGER IF EXISTS "create_attendance_on_team_practice" ON "public"."practices";
CREATE TRIGGER "create_attendance_on_team_practice" AFTER INSERT ON "public"."practices" FOR EACH ROW EXECUTE FUNCTION "public"."create_attendance_for_team_practice"();


DROP TRIGGER IF EXISTS "set_team_invite_code" ON "public"."teams";
CREATE TRIGGER "set_team_invite_code" BEFORE INSERT ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_invite_code"();

DROP TRIGGER IF EXISTS "update_announcements_updated_at" ON "public"."announcements";
CREATE TRIGGER "update_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_competitions_updated_at" ON "public"."competitions";
CREATE TRIGGER "update_competitions_updated_at" BEFORE UPDATE ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_entries_updated_at" ON "public"."entries";
CREATE TRIGGER "update_entries_updated_at" BEFORE UPDATE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_practice_log_tags_updated_at" ON "public"."practice_log_tags";
CREATE TRIGGER "update_practice_log_tags_updated_at" BEFORE UPDATE ON "public"."practice_log_tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_practice_logs_updated_at" ON "public"."practice_logs";
CREATE TRIGGER "update_practice_logs_updated_at" BEFORE UPDATE ON "public"."practice_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_practice_tags_updated_at" ON "public"."practice_tags";
CREATE TRIGGER "update_practice_tags_updated_at" BEFORE UPDATE ON "public"."practice_tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_practice_times_updated_at" ON "public"."practice_times";
CREATE TRIGGER "update_practice_times_updated_at" BEFORE UPDATE ON "public"."practice_times" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_practices_updated_at" ON "public"."practices";
CREATE TRIGGER "update_practices_updated_at" BEFORE UPDATE ON "public"."practices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_records_updated_at" ON "public"."records";
CREATE TRIGGER "update_records_updated_at" BEFORE UPDATE ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_split_times_updated_at" ON "public"."split_times";
CREATE TRIGGER "update_split_times_updated_at" BEFORE UPDATE ON "public"."split_times" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_team_attendance_updated_at" ON "public"."team_attendance";
CREATE TRIGGER "update_team_attendance_updated_at" BEFORE UPDATE ON "public"."team_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_team_groups_updated_at" ON "public"."team_groups";
CREATE TRIGGER "update_team_groups_updated_at" BEFORE UPDATE ON "public"."team_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_team_memberships_updated_at" ON "public"."team_memberships";
CREATE TRIGGER "update_team_memberships_updated_at" BEFORE UPDATE ON "public"."team_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_teams_updated_at" ON "public"."teams";
CREATE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_user_sessions_updated_at" ON "public"."user_sessions";
CREATE TRIGGER "update_user_sessions_updated_at" BEFORE UPDATE ON "public"."user_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_users_updated_at" ON "public"."users";
CREATE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."group_assignments"
    ADD CONSTRAINT "group_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."group_assignments"
    ADD CONSTRAINT "group_assignments_team_group_id_fkey" FOREIGN KEY ("team_group_id") REFERENCES "public"."team_groups"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."group_assignments"
    ADD CONSTRAINT "group_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_log_tags"
    ADD CONSTRAINT "practice_log_tags_practice_log_id_fkey" FOREIGN KEY ("practice_log_id") REFERENCES "public"."practice_logs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_log_tags"
    ADD CONSTRAINT "practice_log_tags_practice_tag_id_fkey" FOREIGN KEY ("practice_tag_id") REFERENCES "public"."practice_tags"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_logs"
    ADD CONSTRAINT "practice_logs_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_logs"
    ADD CONSTRAINT "practice_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_tags"
    ADD CONSTRAINT "practice_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_times"
    ADD CONSTRAINT "practice_times_practice_log_id_fkey" FOREIGN KEY ("practice_log_id") REFERENCES "public"."practice_logs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practice_times"
    ADD CONSTRAINT "practice_times_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practices"
    ADD CONSTRAINT "practices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practices"
    ADD CONSTRAINT "practices_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."practices"
    ADD CONSTRAINT "practices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."split_times"
    ADD CONSTRAINT "split_times_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_attendance"
    ADD CONSTRAINT "team_attendance_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_attendance"
    ADD CONSTRAINT "team_attendance_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_attendance"
    ADD CONSTRAINT "team_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_groups"
    ADD CONSTRAINT "team_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_groups"
    ADD CONSTRAINT "team_groups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


CREATE POLICY "Users can insert team memberships" ON "public"."team_memberships" FOR INSERT WITH CHECK (
  ((SELECT "auth"."uid"()) = "user_id")
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE (
        ("teams"."id" = "team_memberships"."team_id")
        AND
        ("teams"."created_by" = (SELECT "auth"."uid"()))
      )
    )
  )
);



CREATE POLICY "Everyone can view styles" ON "public"."styles" FOR SELECT USING (true);

CREATE POLICY "Team admins can create announcements" ON "public"."announcements" FOR INSERT WITH CHECK (public.is_team_admin("announcements"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Team admins can delete announcements" ON "public"."announcements" FOR DELETE USING (public.is_team_admin("announcements"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Team admins can delete group assignments" ON "public"."group_assignments" FOR DELETE USING (public.is_team_admin((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), (SELECT "auth"."uid"())));

CREATE POLICY "Team admins can delete groups" ON "public"."team_groups" FOR DELETE USING (public.is_team_admin("team_groups"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Users can delete team memberships" ON "public"."team_memberships" FOR DELETE USING (
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE (
        ("teams"."id" = "team_memberships"."team_id")
        AND
        ("teams"."created_by" = (SELECT "auth"."uid"()))
      )
    )
  )
);

CREATE POLICY "Users can manage own attendance" ON "public"."team_attendance" FOR INSERT WITH CHECK (
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    (
      ("practice_id" IS NOT NULL)
      AND
      (
        SELECT public.is_team_admin("p"."team_id", (SELECT "auth"."uid"()))
        FROM "public"."practices" "p"
        WHERE "p"."id" = "team_attendance"."practice_id"
        LIMIT 1
      )
    )
    OR
    (
      ("competition_id" IS NOT NULL)
      AND
      (
        SELECT public.is_team_admin("c"."team_id", (SELECT "auth"."uid"()))
        FROM "public"."competitions" "c"
        WHERE "c"."id" = "team_attendance"."competition_id"
        LIMIT 1
      )
    )
  )
);


CREATE POLICY "Team admins can manage group assignments" ON "public"."group_assignments" FOR INSERT WITH CHECK (public.is_team_admin((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), (SELECT "auth"."uid"())));

CREATE POLICY "Team admins can manage groups" ON "public"."team_groups" FOR INSERT WITH CHECK (public.is_team_admin("team_groups"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Users can update own attendance" ON "public"."team_attendance" FOR UPDATE USING (
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    (
      ("practice_id" IS NOT NULL)
      AND
      (
        SELECT public.is_team_admin("p"."team_id", (SELECT "auth"."uid"()))
        FROM "public"."practices" "p"
        WHERE "p"."id" = "team_attendance"."practice_id"
        LIMIT 1
      )
    )
    OR
    (
      ("competition_id" IS NOT NULL)
      AND
      (
        SELECT public.is_team_admin("c"."team_id", (SELECT "auth"."uid"()))
        FROM "public"."competitions" "c"
        WHERE "c"."id" = "team_attendance"."competition_id"
        LIMIT 1
      )
    )
  )
);

CREATE POLICY "Team admins can update announcements" ON "public"."announcements" FOR UPDATE USING (public.is_team_admin("announcements"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Team admins can update group assignments" ON "public"."group_assignments" FOR UPDATE USING (public.is_team_admin((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), (SELECT "auth"."uid"())));

CREATE POLICY "Team admins can update groups" ON "public"."team_groups" FOR UPDATE USING (public.is_team_admin("team_groups"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Users can update team memberships" ON "public"."team_memberships" FOR UPDATE USING (
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE (
        ("teams"."id" = "team_memberships"."team_id")
        AND
        ("teams"."created_by" = (SELECT "auth"."uid"()))
      )
    )
  )
) WITH CHECK (
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE (
        ("teams"."id" = "team_memberships"."team_id")
        AND
        ("teams"."created_by" = (SELECT "auth"."uid"()))
      )
    )
  )
);

CREATE POLICY "Team members can view announcements" ON "public"."announcements" FOR SELECT USING (public.is_team_member("announcements"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Team members can view attendance" ON "public"."team_attendance" FOR SELECT USING (
  (
    ("practice_id" IS NOT NULL)
    AND
    (
      SELECT public.is_team_member("p"."team_id", (SELECT "auth"."uid"()))
      FROM "public"."practices" "p"
      WHERE "p"."id" = "team_attendance"."practice_id"
      LIMIT 1
    )
  )
  OR
  (
    ("competition_id" IS NOT NULL)
    AND
    (
      SELECT public.is_team_member("c"."team_id", (SELECT "auth"."uid"()))
      FROM "public"."competitions" "c"
      WHERE "c"."id" = "team_attendance"."competition_id"
      LIMIT 1
    )
  )
);

CREATE POLICY "Team members can view group assignments" ON "public"."group_assignments" FOR SELECT USING (public.is_team_member((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), (SELECT "auth"."uid"())));

CREATE POLICY "Team members can view groups" ON "public"."team_groups" FOR SELECT USING (public.is_team_member("team_groups"."team_id", (SELECT "auth"."uid"())));

CREATE POLICY "Users can create own competitions" ON "public"."competitions" FOR INSERT WITH CHECK (("user_id" = (SELECT "auth"."uid"())));

CREATE POLICY "Users can create own entries" ON "public"."entries" FOR INSERT WITH CHECK (
  public.is_team_admin("entries"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("entries"."team_id", (SELECT "auth"."uid"()))
    )
  )
);

CREATE POLICY "Users can delete own competitions" ON "public"."competitions" FOR DELETE USING (("user_id" = (SELECT "auth"."uid"())));

CREATE POLICY "Users can delete own entries" ON "public"."entries" FOR DELETE USING (
  public.is_team_admin("entries"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("entries"."team_id", (SELECT "auth"."uid"()))
    )
  )
);

CREATE POLICY "Users can delete own practice_log_tags" ON "public"."practice_log_tags" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can delete own practice_logs" ON "public"."practice_logs" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can delete own practice_tags" ON "public"."practice_tags" FOR DELETE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can delete own practice_times" ON "public"."practice_times" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can delete own practices" ON "public"."practices" FOR DELETE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can delete own profile" ON "public"."users" FOR DELETE USING (((SELECT "auth"."uid"()) = "id"));

CREATE POLICY "Users can delete own records" ON "public"."records" FOR DELETE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can delete own sessions" ON "public"."user_sessions" FOR DELETE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can delete own split_times" ON "public"."split_times" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can insert own practice_log_tags" ON "public"."practice_log_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can insert own practice_logs" ON "public"."practice_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can insert own practice_tags" ON "public"."practice_tags" FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can insert own practice_times" ON "public"."practice_times" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can insert own practices" ON "public"."practices" FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "id"));

CREATE POLICY "Users can insert own records" ON "public"."records" FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can insert own sessions" ON "public"."user_sessions" FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can insert own split_times" ON "public"."split_times" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = (SELECT "auth"."uid"()))))));


CREATE POLICY "Users can update own competitions" ON "public"."competitions" FOR UPDATE USING ((("user_id" = (SELECT "auth"."uid"())) OR public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"()))));

CREATE POLICY "Users can update own entries" ON "public"."entries" FOR UPDATE USING (
  public.is_team_admin("entries"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("entries"."team_id", (SELECT "auth"."uid"()))
    )
  )
) WITH CHECK (
  public.is_team_admin("entries"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("entries"."team_id", (SELECT "auth"."uid"()))
    )
  )
);

CREATE POLICY "Users can update own practice_log_tags" ON "public"."practice_log_tags" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can update own practice_logs" ON "public"."practice_logs" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can update own practice_tags" ON "public"."practice_tags" FOR UPDATE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can update own practice_times" ON "public"."practice_times" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can update own practices" ON "public"."practices" FOR UPDATE USING ((("user_id" = (SELECT "auth"."uid"())) OR public.is_team_admin("practices"."team_id", (SELECT "auth"."uid"()))));

CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (((SELECT "auth"."uid"()) = "id"));

CREATE POLICY "Users can update own records" ON "public"."records" FOR UPDATE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can update own sessions" ON "public"."user_sessions" FOR UPDATE USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can update own split_times" ON "public"."split_times" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can view competitions" ON "public"."competitions" FOR SELECT USING (true);

CREATE POLICY "Users can view own entries" ON "public"."entries" FOR SELECT USING (
  (
    public.is_team_admin("entries"."team_id", (SELECT "auth"."uid"()))
    OR
    (
      (
        ("team_id" IS NULL) AND ("user_id" = (SELECT "auth"."uid"()))
      )
      OR
      public.is_team_member("entries"."team_id", (SELECT "auth"."uid"()))
    )
  )
);

CREATE POLICY "Users can view own practice_log_tags" ON "public"."practice_log_tags" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can view own practice_logs" ON "public"."practice_logs" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can view own practice_tags" ON "public"."practice_tags" FOR SELECT USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can view own practice_times" ON "public"."practice_times" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = (SELECT "auth"."uid"()))))));

CREATE POLICY "Users can view own profile and team members" ON "public"."users" FOR SELECT USING (
  ((SELECT "auth"."uid"()) = "id")
  OR
  public.shares_active_team("users"."id", (SELECT "auth"."uid"()))
  OR
  -- チーム管理者は承認待ちユーザー情報も閲覧可能
  EXISTS (
    SELECT 1
    FROM "public"."team_memberships" tm
    WHERE tm.user_id = "users"."id"
      AND tm.status = 'pending'::"public"."membership_status_type"
      AND public.is_team_admin(tm.team_id, (SELECT "auth"."uid"()))
  )
);

CREATE POLICY "Users can view own records" ON "public"."records" FOR SELECT USING (((SELECT "auth"."uid"()) = "user_id"));

-- チームメンバーは同じチームのメンバーの個人記録（team_id IS NULL）を閲覧可能
CREATE POLICY "Team members can view teammates' personal records" ON "public"."records"
FOR SELECT USING (
  team_id IS NULL
  AND
  public.shares_active_team(records.user_id, (SELECT auth.uid()))
);

-- チームメンバーはチーム記録を閲覧可能
CREATE POLICY "Team members can view team records" ON "public"."records"
FOR SELECT USING (
  team_id IS NOT NULL
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.is_active = true
  )
);

-- チーム管理者による代理INSERT
CREATE POLICY "Team admins can insert team member records" ON "public"."records"
FOR INSERT WITH CHECK (
  team_id IS NOT NULL
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = records.user_id
    AND tm.is_active = true
  )
);

-- チーム管理者による代理UPDATE
CREATE POLICY "Team admins can update team member records" ON "public"."records"
FOR UPDATE USING (
  team_id IS NOT NULL
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = records.user_id
    AND tm.is_active = true
  )
);

-- チーム管理者による代理DELETE
CREATE POLICY "Team admins can delete team member records" ON "public"."records"
FOR DELETE USING (
  team_id IS NOT NULL
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = records.user_id
    AND tm.is_active = true
  )
);

CREATE POLICY "Users can view own sessions" ON "public"."user_sessions" FOR SELECT USING (((SELECT "auth"."uid"()) = "user_id"));

CREATE POLICY "Users can view own split_times" ON "public"."split_times" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = (SELECT "auth"."uid"()))))));

-- チームメンバーはチーム記録のスプリットを閲覧可能
CREATE POLICY "Team members can view team split_times" ON "public"."split_times"
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.is_active = true
  )
);

-- チーム管理者による代理INSERT
CREATE POLICY "Team admins can insert team member split_times" ON "public"."split_times"
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
);

-- チーム管理者による代理UPDATE
CREATE POLICY "Team admins can update team member split_times" ON "public"."split_times"
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
);

-- チーム管理者による代理DELETE
CREATE POLICY "Team admins can delete team member split_times" ON "public"."split_times"
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
);

CREATE POLICY "Users can view practices" ON "public"."practices" FOR SELECT USING (((("team_id" IS NULL) AND ((SELECT "auth"."uid"()) = "user_id")) OR public.is_team_member("practices"."team_id", (SELECT "auth"."uid"()))));

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."competitions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."group_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."practice_log_tags" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."practice_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."practice_tags" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."practice_times" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."practices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."split_times" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."team_attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."team_groups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."team_memberships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."styles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can view team memberships" ON "public"."team_memberships"
FOR SELECT USING (
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    "status" = 'approved'::"public"."membership_status_type"
    AND
    "is_active" = true
    AND
    public.is_team_member("team_memberships"."team_id", (SELECT "auth"."uid"()))
  )
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE (
        ("teams"."id" = "team_memberships"."team_id")
        AND
        ("teams"."created_by" = (SELECT "auth"."uid"()))
      )
    )
  )
);


CREATE POLICY "teams_delete_creator" ON "public"."teams" FOR DELETE USING (("created_by" = (SELECT "auth"."uid"())));

CREATE POLICY "teams_insert_authenticated" ON "public"."teams" FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "created_by"));

CREATE POLICY "teams_select_members" ON "public"."teams" FOR SELECT USING ((public.is_team_member("teams"."id", (SELECT "auth"."uid"())) OR ("created_by" = (SELECT "auth"."uid"()))));

CREATE POLICY "teams_update_creator" ON "public"."teams" FOR UPDATE USING (("created_by" = (SELECT "auth"."uid"()))) WITH CHECK (("created_by" = (SELECT "auth"."uid"())));

ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."create_attendance_for_team_competition"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_attendance_for_team_competition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_attendance_for_team_competition"() TO "service_role";

GRANT ALL ON FUNCTION "public"."create_attendance_for_team_practice"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_attendance_for_team_practice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_attendance_for_team_practice"() TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."replace_practice_log_tags"("p_practice_log_id" "uuid", "p_tag_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."replace_practice_log_tags"("p_practice_log_id" "uuid", "p_tag_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_practice_log_tags"("p_practice_log_id" "uuid", "p_tag_ids" "uuid"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_practice_logs"("p_practice_id" "uuid", "p_logs_data" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "service_role";


GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";

GRANT ALL ON TABLE "public"."competitions" TO "anon";
GRANT ALL ON TABLE "public"."competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."competitions" TO "service_role";

GRANT ALL ON TABLE "public"."entries" TO "anon";
GRANT ALL ON TABLE "public"."entries" TO "authenticated";
GRANT ALL ON TABLE "public"."entries" TO "service_role";

GRANT ALL ON TABLE "public"."practice_logs" TO "anon";
GRANT ALL ON TABLE "public"."practice_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_logs" TO "service_role";

GRANT ALL ON TABLE "public"."practices" TO "anon";
GRANT ALL ON TABLE "public"."practices" TO "authenticated";
GRANT ALL ON TABLE "public"."practices" TO "service_role";

GRANT ALL ON TABLE "public"."records" TO "anon";
GRANT ALL ON TABLE "public"."records" TO "authenticated";
GRANT ALL ON TABLE "public"."records" TO "service_role";

GRANT ALL ON TABLE "public"."team_memberships" TO "anon";
GRANT ALL ON TABLE "public"."team_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."team_memberships" TO "service_role";

GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";

GRANT ALL ON TABLE "public"."calendar_view" TO "anon";
GRANT ALL ON TABLE "public"."calendar_view" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_view" TO "service_role";

GRANT ALL ON TABLE "public"."group_assignments" TO "anon";
GRANT ALL ON TABLE "public"."group_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignments" TO "service_role";

GRANT ALL ON TABLE "public"."practice_log_tags" TO "anon";
GRANT ALL ON TABLE "public"."practice_log_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_log_tags" TO "service_role";

GRANT ALL ON TABLE "public"."practice_tags" TO "anon";
GRANT ALL ON TABLE "public"."practice_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_tags" TO "service_role";

GRANT ALL ON TABLE "public"."practice_times" TO "anon";
GRANT ALL ON TABLE "public"."practice_times" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_times" TO "service_role";

GRANT ALL ON TABLE "public"."split_times" TO "anon";
GRANT ALL ON TABLE "public"."split_times" TO "authenticated";
GRANT ALL ON TABLE "public"."split_times" TO "service_role";

GRANT ALL ON TABLE "public"."styles" TO "anon";
GRANT ALL ON TABLE "public"."styles" TO "authenticated";
GRANT ALL ON TABLE "public"."styles" TO "service_role";

GRANT ALL ON TABLE "public"."team_attendance" TO "anon";
GRANT ALL ON TABLE "public"."team_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."team_attendance" TO "service_role";

GRANT ALL ON TABLE "public"."team_groups" TO "anon";
GRANT ALL ON TABLE "public"."team_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."team_groups" TO "service_role";

GRANT ALL ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

drop extension if exists "pg_net";

-- Storageバケット作成: profile-images
-- dev環境と同じ設定: ファイルサイズ制限なし、MIMEタイプ制限なし
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-images',
  'profile-images',
  true,
  NULL, -- ファイルサイズ制限なし（dev環境と同じ）
  NULL  -- MIMEタイプ制限なし（dev環境と同じ）
)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP POLICY IF EXISTS "Profile images are publicly accessible" ON "storage"."objects";
CREATE POLICY "Profile images are publicly accessible"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
USING ((bucket_id = 'profile-images'::text));

DROP POLICY IF EXISTS "Users can delete their own profile images" ON "storage"."objects";
CREATE POLICY "Users can delete their own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR DELETE
  TO public
USING (((bucket_id = 'profile-images'::text) AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[2]) AND ((SELECT auth.uid()) IS NOT NULL)));

DROP POLICY IF EXISTS "Users can update their own profile images" ON "storage"."objects";
CREATE POLICY "Users can update their own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO public
USING (((bucket_id = 'profile-images'::text) AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[2]) AND ((SELECT auth.uid()) IS NOT NULL)));

DROP POLICY IF EXISTS "Users can upload their own profile images" ON "storage"."objects";
CREATE POLICY "Users can upload their own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR INSERT
  TO public
WITH CHECK (((bucket_id = 'profile-images'::text) AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[2]) AND ((SELECT auth.uid()) IS NOT NULL)));

DROP POLICY IF EXISTS "Users can view profile images" ON "storage"."objects";
CREATE POLICY "Users can view profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
USING ((bucket_id = 'profile-images'::text));

-- stylesテーブルに固定データを挿入
DELETE FROM "public"."styles";
INSERT INTO "public"."styles" ("id", "name_jp", "name", "style", "distance") VALUES
(1, '25m自由形', '25Fr', 'fr', 25),
(2, '50m自由形', '50Fr', 'fr', 50),
(3, '100m自由形', '100Fr', 'fr', 100),
(4, '200m自由形', '200Fr', 'fr', 200),
(5, '400m自由形', '400Fr', 'fr', 400),
(6, '800m自由形', '800Fr', 'fr', 800),
(7, '1500m自由形', '1500Fr', 'fr', 1500),
(8, '25m平泳ぎ', '25Br', 'br', 25),
(9, '50m平泳ぎ', '50Br', 'br', 50),
(10, '100m平泳ぎ', '100Br', 'br', 100),
(11, '200m平泳ぎ', '200Br', 'br', 200),
(12, '25m背泳ぎ', '25Ba', 'ba', 25),
(13, '50m背泳ぎ', '50Ba', 'ba', 50),
(14, '100m背泳ぎ', '100Ba', 'ba', 100),
(15, '200m背泳ぎ', '200Ba', 'ba', 200),
(16, '25mバタフライ', '25Fly', 'fly', 25),
(17, '50mバタフライ', '50Fly', 'fly', 50),
(18, '100mバタフライ', '100Fly', 'fly', 100),
(19, '200mバタフライ', '200Fly', 'fly', 200),
(20, '100m個人メドレー', '100IM', 'im', 100),
(21, '200m個人メドレー', '200IM', 'im', 200),
(22, '400m個人メドレー', '400IM', 'im', 400);

-- テーブル一覧を確認
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;