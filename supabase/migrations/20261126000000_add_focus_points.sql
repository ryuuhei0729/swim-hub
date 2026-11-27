-- =============================================================================
-- フォーカスポイント (focus_points)
-- =============================================================================
-- 「右手の入水を遠くに」「腰を浮かせる」のような、数字で測らない泳ぎの意識ポイント。
-- 大会目標 (goals) やマイルストーンとは独立して持つ (大会をまたいで続き、期限も達成判定も無い)。
--
-- 状態:
--   active   = 取り組み中。1ユーザーにつき同時に3つまで (下のトリガーで強制する)
--   mastered = 身についた。履歴として残す
-- 不要になったものは行ごと削除する。
--
-- 冪等性: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS のみ。
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."focus_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "title" text NOT NULL CHECK (char_length(btrim("title")) BETWEEN 1 AND 100),
  "note" text NULL CHECK ("note" IS NULL OR char_length("note") <= 1000),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'mastered')),
  -- 身についた日時。端末の時計ではなく DB の時刻で入れる (下の set_focus_point_mastered_at)
  "mastered_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "focus_points_mastered_at_matches_status"
    CHECK (("status" = 'mastered') = ("mastered_at" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS "idx_focus_points_user_id_status"
  ON "public"."focus_points" ("user_id", "status");

-- -----------------------------------------------------------------------------
-- updated_at 自動更新
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "update_focus_points_updated_at" ON "public"."focus_points";
CREATE TRIGGER "update_focus_points_updated_at"
  BEFORE UPDATE ON "public"."focus_points"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_updated_at_column"();

-- -----------------------------------------------------------------------------
-- mastered_at は状態に合わせて DB が入れる
-- -----------------------------------------------------------------------------
-- 「身についた」にした時刻を端末の時計に任せると、時計がずれた端末の分だけ
-- 身についた順の並びが狂う。状態が mastered になった時点の now() を入れ、active に戻したら消す。
CREATE OR REPLACE FUNCTION "public"."set_focus_point_mastered_at"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'mastered' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'mastered' THEN
      NEW.mastered_at := now();
    END IF;
  ELSE
    NEW.mastered_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "set_focus_point_mastered_at" ON "public"."focus_points";
CREATE TRIGGER "set_focus_point_mastered_at"
  BEFORE INSERT OR UPDATE OF "status" ON "public"."focus_points"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."set_focus_point_mastered_at"();

REVOKE ALL ON FUNCTION "public"."set_focus_point_mastered_at"() FROM PUBLIC, "anon", "authenticated";

-- -----------------------------------------------------------------------------
-- 取り組み中 (active) は1ユーザー3つまで
-- -----------------------------------------------------------------------------
-- アプリ側でも追加前に件数を見るが、別端末からの同時追加もあるので DB でも止める。
-- 同じユーザーの追加・再開が同時に走っても数え漏れないよう、ユーザー単位の advisory lock を取る。
-- エラーメッセージ 'focus_point_limit_exceeded' はアプリ側 (FocusPointAPI) が見分けに使う。
CREATE OR REPLACE FUNCTION "public"."enforce_focus_point_active_limit"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  -- 既に active の行を active のまま更新する (タイトル編集など) ときは数え直さない
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('focus_points:' || NEW.user_id::text, 0));

  SELECT count(*) INTO active_count
  FROM public.focus_points
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND id <> NEW.id;

  IF active_count >= 3 THEN
    RAISE EXCEPTION 'focus_point_limit_exceeded'
      USING ERRCODE = 'P0001',
            HINT = 'A user can have at most 3 active focus points.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "enforce_focus_point_active_limit" ON "public"."focus_points";
CREATE TRIGGER "enforce_focus_point_active_limit"
  BEFORE INSERT OR UPDATE OF "status", "user_id" ON "public"."focus_points"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."enforce_focus_point_active_limit"();

REVOKE ALL ON FUNCTION "public"."enforce_focus_point_active_limit"() FROM PUBLIC, "anon", "authenticated";

-- -----------------------------------------------------------------------------
-- RLS: 本人の行だけ
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."focus_points" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own focus points" ON "public"."focus_points";
CREATE POLICY "Users can view their own focus points"
  ON "public"."focus_points" FOR SELECT
  USING ((select auth.uid()) = "user_id");

DROP POLICY IF EXISTS "Users can create their own focus points" ON "public"."focus_points";
CREATE POLICY "Users can create their own focus points"
  ON "public"."focus_points" FOR INSERT
  WITH CHECK ((select auth.uid()) = "user_id");

DROP POLICY IF EXISTS "Users can update their own focus points" ON "public"."focus_points";
CREATE POLICY "Users can update their own focus points"
  ON "public"."focus_points" FOR UPDATE
  USING ((select auth.uid()) = "user_id")
  WITH CHECK ((select auth.uid()) = "user_id");

DROP POLICY IF EXISTS "Users can delete their own focus points" ON "public"."focus_points";
CREATE POLICY "Users can delete their own focus points"
  ON "public"."focus_points" FOR DELETE
  USING ((select auth.uid()) = "user_id");

-- -----------------------------------------------------------------------------
-- テーブル権限 (default privileges 由来の GRANT ALL を打ち消す)
-- -----------------------------------------------------------------------------
-- initial_schema.sql の ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "anon" / "authenticated"
-- により、新しいテーブルには作成時点で両ロールに TRUNCATE まで付く。TRUNCATE は RLS が効かず、
-- ログイン済みユーザーが全員分を空にできてしまうので、authenticated からも一度 REVOKE ALL して
-- 必要な DML だけ付け直す (20260908000000_add_relay_records.sql と同じ方針)。anon には何も与えない。
REVOKE ALL ON TABLE "public"."focus_points" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."focus_points" TO "authenticated";
GRANT ALL ON TABLE "public"."focus_points" TO "service_role";
