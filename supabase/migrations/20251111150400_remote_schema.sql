
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

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE TYPE "public"."attendance_status_type" AS ENUM (
    'before',
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

CREATE OR REPLACE FUNCTION "public"."create_attendance_for_team_competition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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
    AS $$
BEGIN
  RETURN upper(substring(md5(random()::text) from 1 for 8));
END;
$$;

ALTER FUNCTION "public"."generate_invite_code"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION "public"."set_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_invite_code"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_published_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.is_published = true AND OLD.is_published = false THEN
    NEW.published_at := NOW();
  ELSIF NEW.is_published = false THEN
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_published_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_best_times"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 新しい記録がベストタイムかチェック
  INSERT INTO best_times (user_id, style_id, pool_type, best_time, record_id, achieved_date)
  VALUES (NEW.user_id, NEW.style_id, NEW.pool_type, NEW.time, NEW.id, NEW.record_date)
  ON CONFLICT (user_id, style_id, pool_type)
  DO UPDATE SET
    best_time = CASE
      WHEN EXCLUDED.best_time < best_times.best_time THEN EXCLUDED.best_time
      ELSE best_times.best_time
    END,
    record_id = CASE
      WHEN EXCLUDED.best_time < best_times.best_time THEN EXCLUDED.record_id
      ELSE best_times.record_id
    END,
    achieved_date = CASE
      WHEN EXCLUDED.best_time < best_times.best_time THEN EXCLUDED.achieved_date
      ELSE best_times.achieved_date
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_best_times"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "is_published" boolean DEFAULT false,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."announcements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "date" "date" NOT NULL,
    "place" "text",
    "pool_type" integer DEFAULT 0,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "created_by" "uuid",
    "user_id" "uuid",
    "entry_status" "public"."entry_status_type" DEFAULT 'before'::"public"."entry_status_type" NOT NULL,
    "attendance_status" "public"."attendance_status_type" DEFAULT 'before'::"public"."attendance_status_type",
    CONSTRAINT "competitions_pool_type_check" CHECK (("pool_type" = ANY (ARRAY[0, 1])))
);

ALTER TABLE "public"."competitions" OWNER TO "postgres";

COMMENT ON COLUMN "public"."competitions"."entry_status" IS 'エントリーステータス: before=エントリー前, open=エントリー受付中, closed=エントリー締切';

COMMENT ON COLUMN "public"."competitions"."attendance_status" IS '出欠提出ステータス: before=提出前, open=提出受付中, closed=提出締切';

CREATE TABLE IF NOT EXISTS "public"."entries" (
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

CREATE TABLE IF NOT EXISTS "public"."practice_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "practice_id" "uuid" NOT NULL,
    "style" "text" NOT NULL,
    "rep_count" integer NOT NULL,
    "set_count" integer NOT NULL,
    "distance" integer NOT NULL,
    "circle" numeric(10,2),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."practices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "place" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "created_by" "uuid",
    "attendance_status" "public"."attendance_status_type" DEFAULT 'before'::"public"."attendance_status_type"
);

ALTER TABLE "public"."practices" OWNER TO "postgres";

COMMENT ON COLUMN "public"."practices"."attendance_status" IS '出欠提出ステータス: before=提出前, open=提出受付中, closed=提出締切';

CREATE TABLE IF NOT EXISTS "public"."records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "competition_id" "uuid",
    "style_id" integer NOT NULL,
    "time" numeric(10,2) NOT NULL,
    "video_url" "text",
    "note" "text",
    "is_relaying" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid"
);

ALTER TABLE "public"."records" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."team_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "joined_at" "date" DEFAULT CURRENT_DATE,
    "left_at" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_memberships_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'user'::"text"])))
);

ALTER TABLE "public"."team_memberships" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."teams" (
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
SELECT "p"."id",
    'practice'::"text" AS "item_type",
    "p"."date" AS "item_date",
    '練習'::"text" AS "title",
    "p"."place",
    "p"."note",
    "jsonb_build_object"('practice', "to_jsonb"("p".*), 'user_id', "p"."user_id") AS "metadata"
  FROM "public"."practices" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."practice_logs" "pl"
          WHERE ("pl"."practice_id" = "p"."id")))))
UNION ALL
SELECT "p"."id",
    'team_practice'::"text" AS "item_type",
    "p"."date" AS "item_date",
    'チーム練習'::"text" AS "title",
    "p"."place",
    "p"."note",
    "jsonb_build_object"('practice', "to_jsonb"("p".*), 'user_id', "p"."user_id", 'team_id', "p"."team_id", 'team', "to_jsonb"("t".*)) AS "metadata"
  FROM ("public"."practices" "p"
    JOIN "public"."teams" "t" ON (("t"."id" = "p"."team_id")))
  WHERE (("p"."team_id" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."practice_logs" "pl"
          WHERE ("pl"."practice_id" = "p"."id")))) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "p"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."is_active" = true)))))
UNION ALL
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
  WHERE (("pl"."user_id" = "auth"."uid"()) AND ("p"."team_id" IS NULL))
UNION ALL
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
          WHERE (("tm"."team_id" = "p"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."is_active" = true)))))
UNION ALL
SELECT "c"."id",
    'competition'::"text" AS "item_type",
    "c"."date" AS "item_date",
    "c"."title",
    "c"."place",
    "c"."note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'pool_type', "c"."pool_type") AS "metadata"
  FROM "public"."competitions" "c"
  WHERE (("c"."user_id" = "auth"."uid"()) AND ("c"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = "auth"."uid"()))))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."team_id" IS NULL))))))
UNION ALL
SELECT "c"."id",
    'team_competition'::"text" AS "item_type",
    "c"."date" AS "item_date",
    "c"."title",
    "c"."place",
    "c"."note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'pool_type', "c"."pool_type") AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = "auth"."uid"()))))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."team_id" IS NOT NULL))))))
UNION ALL
SELECT "c"."id",
    'entry'::"text" AS "item_type",
    "c"."date" AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id") AS "metadata"
  FROM "public"."competitions" "c"
  WHERE (("c"."user_id" = "auth"."uid"()) AND ("c"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = "auth"."uid"()))))) AND (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."team_id" IS NULL)))))
UNION ALL
SELECT "c"."id",
    'entry'::"text" AS "item_type",
    "c"."date" AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*)) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = "auth"."uid"()))))) AND (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."team_id" IS NOT NULL)))))
UNION ALL
SELECT "c"."id",
    'record'::"text" AS "item_type",
    "c"."date" AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'pool_type', "c"."pool_type") AS "metadata"
  FROM "public"."competitions" "c"
  WHERE (("c"."user_id" = "auth"."uid"()) AND ("c"."team_id" IS NULL) AND (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = "auth"."uid"())))))
UNION ALL
SELECT "c"."id",
    'record'::"text" AS "item_type",
    "c"."date" AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'pool_type', "c"."pool_type") AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."is_active" = true)))) AND (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = "auth"."uid"())))));

ALTER VIEW "public"."calendar_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."calendar_view" IS 'カレンダー表示用の統合ビュー（練習、練習ログ、大会、エントリー、記録を含む）。placeカラムで統一。';

CREATE TABLE IF NOT EXISTS "public"."group_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."group_assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."practice_log_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "practice_log_id" "uuid" NOT NULL,
    "practice_tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_log_tags" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."practice_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#3B82F6'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."practice_tags" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."practice_times" (
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

CREATE TABLE IF NOT EXISTS "public"."split_times" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid" NOT NULL,
    "distance" integer NOT NULL,
    "split_time" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."split_times" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."styles" (
    "id" integer NOT NULL,
    "name_jp" "text" NOT NULL,
    "name" "text" NOT NULL,
    "style" "text" NOT NULL,
    "distance" integer NOT NULL,
    CONSTRAINT "styles_style_check" CHECK (("style" = ANY (ARRAY['fr'::"text", 'br'::"text", 'ba'::"text", 'fly'::"text", 'im'::"text"])))
);

ALTER TABLE "public"."styles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."team_attendance" (
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

CREATE TABLE IF NOT EXISTS "public"."team_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."team_groups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
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

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "gender" integer DEFAULT 0 NOT NULL,
    "birthday" "date",
    "profile_image_path" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "users_gender_check" CHECK (("gender" = ANY (ARRAY[0, 1])))
);

ALTER TABLE "public"."users" OWNER TO "postgres";

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

CREATE INDEX "idx_announcements_published_at" ON "public"."announcements" USING "btree" ("published_at");

CREATE INDEX "idx_announcements_team_id" ON "public"."announcements" USING "btree" ("team_id");

CREATE INDEX "idx_competitions_attendance_status" ON "public"."competitions" USING "btree" ("attendance_status");

CREATE INDEX "idx_competitions_created_at" ON "public"."competitions" USING "btree" ("created_at");

CREATE INDEX "idx_competitions_date" ON "public"."competitions" USING "btree" ("date");

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

CREATE INDEX "idx_teams_created_at" ON "public"."teams" USING "btree" ("created_at");

CREATE INDEX "idx_teams_created_by" ON "public"."teams" USING "btree" ("created_by");

CREATE INDEX "idx_teams_invite_code" ON "public"."teams" USING "btree" ("invite_code");

CREATE INDEX "idx_user_sessions_expires_at" ON "public"."user_sessions" USING "btree" ("expires_at");

CREATE INDEX "idx_user_sessions_session_id" ON "public"."user_sessions" USING "btree" ("session_id");

CREATE INDEX "idx_user_sessions_updated_at" ON "public"."user_sessions" USING "btree" ("updated_at");

CREATE INDEX "idx_user_sessions_user_id" ON "public"."user_sessions" USING "btree" ("user_id");

CREATE INDEX "idx_users_gender" ON "public"."users" USING "btree" ("gender");

CREATE INDEX "idx_users_name" ON "public"."users" USING "btree" ("name");

CREATE OR REPLACE TRIGGER "create_attendance_on_team_competition" AFTER INSERT ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."create_attendance_for_team_competition"();

CREATE OR REPLACE TRIGGER "create_attendance_on_team_practice" AFTER INSERT ON "public"."practices" FOR EACH ROW EXECUTE FUNCTION "public"."create_attendance_for_team_practice"();

CREATE OR REPLACE TRIGGER "set_announcement_published_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."set_published_at"();

CREATE OR REPLACE TRIGGER "set_team_invite_code" BEFORE INSERT ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_invite_code"();

CREATE OR REPLACE TRIGGER "update_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_competitions_updated_at" BEFORE UPDATE ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_entries_updated_at" BEFORE UPDATE ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_practice_log_tags_updated_at" BEFORE UPDATE ON "public"."practice_log_tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_practice_logs_updated_at" BEFORE UPDATE ON "public"."practice_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_practice_tags_updated_at" BEFORE UPDATE ON "public"."practice_tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_practice_times_updated_at" BEFORE UPDATE ON "public"."practice_times" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_practices_updated_at" BEFORE UPDATE ON "public"."practices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_records_updated_at" BEFORE UPDATE ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_split_times_updated_at" BEFORE UPDATE ON "public"."split_times" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_team_attendance_updated_at" BEFORE UPDATE ON "public"."team_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_team_groups_updated_at" BEFORE UPDATE ON "public"."team_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_team_memberships_updated_at" BEFORE UPDATE ON "public"."team_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_user_sessions_updated_at" BEFORE UPDATE ON "public"."user_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

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

CREATE POLICY "Authenticated users can delete competitions" ON "public"."competitions" FOR DELETE USING (("auth"."uid"() IS NOT NULL));

CREATE POLICY "Authenticated users can insert competitions" ON "public"."competitions" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));

CREATE POLICY "Authenticated users can join teams" ON "public"."team_memberships" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "user_id")));

CREATE POLICY "Authenticated users can update competitions" ON "public"."competitions" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));

CREATE POLICY "Everyone can view competitions" ON "public"."competitions" FOR SELECT USING (true);

CREATE POLICY "Everyone can view styles" ON "public"."styles" FOR SELECT USING (true);

CREATE POLICY "Team admins can create announcements" ON "public"."announcements" FOR INSERT WITH CHECK (public.is_team_admin("announcements"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can delete announcements" ON "public"."announcements" FOR DELETE USING (public.is_team_admin("announcements"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can delete group assignments" ON "public"."group_assignments" FOR DELETE USING (public.is_team_admin((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), "auth"."uid"()));

CREATE POLICY "Team admins can delete groups" ON "public"."team_groups" FOR DELETE USING (public.is_team_admin("team_groups"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can delete memberships" ON "public"."team_memberships" FOR DELETE USING (public.is_team_admin("team_memberships"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can manage all attendance" ON "public"."team_attendance" FOR INSERT WITH CHECK (((( "practice_id" IS NOT NULL) AND (
  SELECT public.is_team_admin("p"."team_id", "auth"."uid"())
  FROM "public"."practices" "p"
  WHERE "p"."id" = "team_attendance"."practice_id"
  LIMIT 1
)) OR (("competition_id" IS NOT NULL) AND (
  SELECT public.is_team_admin("c"."team_id", "auth"."uid"())
  FROM "public"."competitions" "c"
  WHERE "c"."id" = "team_attendance"."competition_id"
  LIMIT 1
))));

CREATE POLICY "Team admins can manage all team entries" ON "public"."entries" USING (public.is_team_admin("entries"."team_id", "auth"."uid"())) WITH CHECK (public.is_team_admin("entries"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can manage group assignments" ON "public"."group_assignments" FOR INSERT WITH CHECK (public.is_team_admin((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), "auth"."uid"()));

CREATE POLICY "Team admins can manage groups" ON "public"."team_groups" FOR INSERT WITH CHECK (public.is_team_admin("team_groups"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can update all attendance" ON "public"."team_attendance" FOR UPDATE USING (((( "practice_id" IS NOT NULL) AND (
  SELECT public.is_team_admin("p"."team_id", "auth"."uid"())
  FROM "public"."practices" "p"
  WHERE "p"."id" = "team_attendance"."practice_id"
  LIMIT 1
)) OR (("competition_id" IS NOT NULL) AND (
  SELECT public.is_team_admin("c"."team_id", "auth"."uid"())
  FROM "public"."competitions" "c"
  WHERE "c"."id" = "team_attendance"."competition_id"
  LIMIT 1
))));

CREATE POLICY "Team admins can update announcements" ON "public"."announcements" FOR UPDATE USING (public.is_team_admin("announcements"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can update group assignments" ON "public"."group_assignments" FOR UPDATE USING (public.is_team_admin((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), "auth"."uid"()));

CREATE POLICY "Team admins can update groups" ON "public"."team_groups" FOR UPDATE USING (public.is_team_admin("team_groups"."team_id", "auth"."uid"()));

CREATE POLICY "Team admins can update memberships" ON "public"."team_memberships" FOR UPDATE USING (public.is_team_admin("team_memberships"."team_id", "auth"."uid"()));

CREATE POLICY "Team members can view announcements" ON "public"."announcements" FOR SELECT USING (public.is_team_member("announcements"."team_id", "auth"."uid"()));

CREATE POLICY "Team members can view attendance" ON "public"."team_attendance" FOR SELECT USING (((("practice_id" IS NOT NULL) AND (
  SELECT public.is_team_member("p"."team_id", "auth"."uid"())
  FROM "public"."practices" "p"
  WHERE "p"."id" = "team_attendance"."practice_id"
  LIMIT 1
)) OR (("competition_id" IS NOT NULL) AND (
  SELECT public.is_team_member("c"."team_id", "auth"."uid"())
  FROM "public"."competitions" "c"
  WHERE "c"."id" = "team_attendance"."competition_id"
  LIMIT 1
))));

CREATE POLICY "Team members can view group assignments" ON "public"."group_assignments" FOR SELECT USING (public.is_team_member((
  SELECT "tg"."team_id"
  FROM "public"."team_groups" "tg"
  WHERE "tg"."id" = "group_assignments"."team_group_id"
), "auth"."uid"()));

CREATE POLICY "Team members can view groups" ON "public"."team_groups" FOR SELECT USING (public.is_team_member("team_groups"."team_id", "auth"."uid"()));

CREATE POLICY "Users can create own competitions" ON "public"."competitions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can create own entries" ON "public"."entries" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (("team_id" IS NULL) OR public.is_team_member("entries"."team_id", "auth"."uid"()))));

CREATE POLICY "Users can delete own competitions" ON "public"."competitions" FOR DELETE USING (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can delete own entries" ON "public"."entries" FOR DELETE USING ((("user_id" = "auth"."uid"()) AND (("team_id" IS NULL) OR public.is_team_member("entries"."team_id", "auth"."uid"()))));

CREATE POLICY "Users can delete own practice_log_tags" ON "public"."practice_log_tags" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can delete own practice_logs" ON "public"."practice_logs" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can delete own practice_tags" ON "public"."practice_tags" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete own practice_times" ON "public"."practice_times" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can delete own practices" ON "public"."practices" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete own profile" ON "public"."users" FOR DELETE USING (("auth"."uid"() = "id"));

CREATE POLICY "Users can delete own records" ON "public"."records" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete own sessions" ON "public"."user_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can delete own split_times" ON "public"."split_times" FOR DELETE USING ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can insert own practice_log_tags" ON "public"."practice_log_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can insert own practice_logs" ON "public"."practice_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can insert own practice_tags" ON "public"."practice_tags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert own practice_times" ON "public"."practice_times" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can insert own practices" ON "public"."practices" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "Users can insert own records" ON "public"."records" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert own sessions" ON "public"."user_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can insert own split_times" ON "public"."split_times" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can manage own attendance" ON "public"."team_attendance" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can update own attendance" ON "public"."team_attendance" FOR UPDATE USING (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can update own competitions" ON "public"."competitions" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR public.is_team_admin("competitions"."team_id", "auth"."uid"())));

CREATE POLICY "Users can update own entries" ON "public"."entries" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND (("team_id" IS NULL) OR public.is_team_member("entries"."team_id", "auth"."uid"())))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (("team_id" IS NULL) OR public.is_team_member("entries"."team_id", "auth"."uid"()))));

CREATE POLICY "Users can update own practice_log_tags" ON "public"."practice_log_tags" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can update own practice_logs" ON "public"."practice_logs" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can update own practice_tags" ON "public"."practice_tags" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update own practice_times" ON "public"."practice_times" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can update own practices" ON "public"."practices" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR public.is_team_admin("practices"."team_id", "auth"."uid"())));

CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));

CREATE POLICY "Users can update own records" ON "public"."records" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update own sessions" ON "public"."user_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update own split_times" ON "public"."split_times" FOR UPDATE USING ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view competitions" ON "public"."competitions" FOR SELECT USING ((("team_id" IS NULL) OR public.is_team_member("competitions"."team_id", "auth"."uid"())));

CREATE POLICY "Users can view own competitions" ON "public"."competitions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("team_id" IS NOT NULL)));

CREATE POLICY "Users can view own entries" ON "public"."entries" FOR SELECT USING (((("team_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR public.is_team_member("entries"."team_id", "auth"."uid"())));

CREATE POLICY "Users can view own practice_log_tags" ON "public"."practice_log_tags" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_log_tags"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view own practice_logs" ON "public"."practice_logs" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM "public"."practices"
  WHERE (("practices"."id" = "practice_logs"."practice_id") AND ("practices"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view own practice_tags" ON "public"."practice_tags" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view own practice_times" ON "public"."practice_times" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."id" = "practice_times"."practice_log_id") AND ("p"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view own profile and team members" ON "public"."users" FOR SELECT USING ((("auth"."uid"() = "id") OR public.shares_active_team("users"."id", "auth"."uid"())));

CREATE POLICY "Users can view own records" ON "public"."records" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view own sessions" ON "public"."user_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view own split_times" ON "public"."split_times" FOR SELECT USING ((EXISTS ( SELECT 1
  FROM "public"."records"
  WHERE (("records"."id" = "split_times"."record_id") AND ("records"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view practices" ON "public"."practices" FOR SELECT USING (((("team_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR public.is_team_member("practices"."team_id", "auth"."uid"())));

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

CREATE POLICY "team_memberships_all_for_team_creator" ON "public"."team_memberships" USING ((EXISTS ( SELECT 1
  FROM "public"."teams"
  WHERE (("teams"."id" = "team_memberships"."team_id") AND ("teams"."created_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
  FROM "public"."teams"
  WHERE (("teams"."id" = "team_memberships"."team_id") AND ("teams"."created_by" = "auth"."uid"())))));

CREATE POLICY "team_memberships_select_own" ON "public"."team_memberships" FOR SELECT USING (("user_id" = "auth"."uid"()));

CREATE POLICY "team_memberships_update_own" ON "public"."team_memberships" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "teams_delete_creator" ON "public"."teams" FOR DELETE USING (("created_by" = "auth"."uid"()));

CREATE POLICY "teams_insert_authenticated" ON "public"."teams" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));

CREATE POLICY "teams_select_members" ON "public"."teams" FOR SELECT USING (public.is_team_member("teams"."id", "auth"."uid"()));

CREATE POLICY "teams_update_creator" ON "public"."teams" FOR UPDATE USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));

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

GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_published_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_published_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_published_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_best_times"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_best_times"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_best_times"() TO "service_role";

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

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  create policy "Profile images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'profile-images'::text));

  create policy "Users can delete their own profile images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'profile-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[2]) AND (auth.uid() IS NOT NULL)));

  create policy "Users can update their own profile images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'profile-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[2]) AND (auth.uid() IS NOT NULL)));

  create policy "Users can upload their own profile images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'profile-images'::text) AND ((auth.uid())::text = (string_to_array(name, '/'::text))[2]) AND (auth.uid() IS NOT NULL)));

  create policy "Users can view profile images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'profile-images'::text));

