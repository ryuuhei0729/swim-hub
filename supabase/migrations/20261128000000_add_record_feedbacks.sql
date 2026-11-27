-- =============================================================================
-- チーム内フィードバック: record_feedbacks
-- =============================================================================
-- 仕様: docs/specs/record-feedback.md
-- 型契約: packages/shared/types/recordFeedback.ts
--
-- 概要:
--   チーム管理者が、チームメンバーの大会記録 (records, team_id IS NOT NULL) に
--   フィードバック (FB) を書く。選手本人と同チームの管理者だけが読める。
--
-- 権限:
--   - 作成 / 編集 / 削除: can_give_record_feedback(team_id, auth.uid()) を満たす人。
--     編集・削除はさらに書いた本人 (author_id = auth.uid()) に限る。
--     自分の記録には書けない (recipient_id <> auth.uid())。
--   - 閲覧: 選手本人 (recipient_id = auth.uid()) または同チームの承認済み・現役の管理者。
--   - 既読: RPC mark_record_feedbacks_read 経由で選手本人だけ。
--   判定は can_give_record_feedback に集約する。将来管理者以外に開放するときは
--   この関数だけを直す (RLS ポリシーは触らない)。
--
-- 列の書き込み制限 (列単位 GRANT):
--   クライアントが書けるのは INSERT: record_id / author_id / content、UPDATE: content だけ。
--   team_id / recipient_id は INSERT 時にトリガが records から埋める
--   (クライアントの申告値を信用しない)。read_at は RPC だけが更新する。
--
-- 未読:
--   read_at IS NULL。本文 (content) が変わったらトリガが read_at を NULL に戻す。
--   updated_at は content の変更時だけ進める (既読化では進めない)。
--   ※ updated_at はクライアントの「編集済み」表示とポップアップの再表示判定に使う。
--
-- ライフサイクル:
--   - records 削除 → CASCADE
--   - teams 削除 → CASCADE (delete_team_preserving_records は records.team_id を
--     NULL にして記録を残すが、FB は team_id の CASCADE で消える)
--   - 書いた人の users 削除 → author_id を NULL (FB は残す)
--   - 選手の users 削除 → records ごと CASCADE
--
-- 冪等性: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS。
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."record_feedbacks" (
  "id"           "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "record_id"    "uuid" NOT NULL,
  "team_id"      "uuid" NOT NULL,
  "recipient_id" "uuid" NOT NULL,
  "author_id"    "uuid" DEFAULT "auth"."uid"(),
  "content"      "text" NOT NULL,
  "read_at"      timestamp with time zone,
  "created_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "record_feedbacks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "record_feedbacks_record_id_fkey"
    FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE,
  CONSTRAINT "record_feedbacks_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE,
  CONSTRAINT "record_feedbacks_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "record_feedbacks_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  -- 1人が1件の記録に書けるのは1件まで (author_id が NULL の退会者の行は重複可)
  CONSTRAINT "record_feedbacks_record_author_key" UNIQUE ("record_id", "author_id"),
  CONSTRAINT "record_feedbacks_content_length_check"
    CHECK ("char_length"("btrim"("content")) BETWEEN 1 AND 1000)
);

ALTER TABLE "public"."record_feedbacks" OWNER TO "postgres";

COMMENT ON TABLE "public"."record_feedbacks" IS 'チーム管理者が大会記録 (チーム記録) に書くフィードバック。仕様は docs/specs/record-feedback.md';
COMMENT ON COLUMN "public"."record_feedbacks"."team_id" IS 'INSERT 時にトリガが records.team_id から設定する';
COMMENT ON COLUMN "public"."record_feedbacks"."recipient_id" IS 'INSERT 時にトリガが records.user_id から設定する (FB を受け取る選手)';
COMMENT ON COLUMN "public"."record_feedbacks"."author_id" IS '書いた管理者。アカウント削除で NULL になる';
COMMENT ON COLUMN "public"."record_feedbacks"."read_at" IS 'NULL = 未読。content の変更で NULL に戻る。mark_record_feedbacks_read だけが設定する';
COMMENT ON COLUMN "public"."record_feedbacks"."updated_at" IS 'content を変更したときだけ進む (既読化では進まない)';

-- record_id は UNIQUE (record_id, author_id) の先頭列なのでそのインデックスで足りる
CREATE INDEX IF NOT EXISTS "idx_record_feedbacks_team_id" ON "public"."record_feedbacks" USING "btree" ("team_id");
CREATE INDEX IF NOT EXISTS "idx_record_feedbacks_author_id" ON "public"."record_feedbacks" USING "btree" ("author_id");
CREATE INDEX IF NOT EXISTS "idx_record_feedbacks_recipient_id" ON "public"."record_feedbacks" USING "btree" ("recipient_id");
-- ダッシュボードの未読ポップアップ用
CREATE INDEX IF NOT EXISTS "idx_record_feedbacks_recipient_unread"
  ON "public"."record_feedbacks" USING "btree" ("recipient_id") WHERE ("read_at" IS NULL);

-- -----------------------------------------------------------------------------
-- 権限判定: FB を書ける (= 閲覧・編集・削除の前提にもなる) か
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."can_give_record_feedback"(
  "p_team_id" "uuid",
  "p_user_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
      AND tm.role = 'admin'
      AND tm.status = 'approved'::public.membership_status_type
      AND tm.is_active IS TRUE
  );
$$;

ALTER FUNCTION "public"."can_give_record_feedback"("uuid", "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."can_give_record_feedback"("uuid", "uuid") IS 'record_feedbacks を書ける (承認済み・現役のチーム管理者) か。権限を開放するときはこの関数だけを直す';

REVOKE ALL ON FUNCTION "public"."can_give_record_feedback"("uuid", "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_give_record_feedback"("uuid", "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_give_record_feedback"("uuid", "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_give_record_feedback"("uuid", "uuid") TO "service_role";

-- -----------------------------------------------------------------------------
-- BEFORE INSERT: team_id / recipient_id を records から埋める
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: records の RLS に関係なく対象記録を引くため。
-- 権限判定はここではせず RLS (WITH CHECK) に任せる。WITH CHECK は BEFORE トリガの
-- 後に評価されるので、ここで埋めた team_id / recipient_id で判定される。
CREATE OR REPLACE FUNCTION "public"."record_feedbacks_before_insert"()
RETURNS trigger
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_team_id uuid;
  v_user_id uuid;
BEGIN
  SELECT r.team_id, r.user_id
    INTO v_team_id, v_user_id
  FROM public.records r
  WHERE r.id = NEW.record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_team_record' USING ERRCODE = 'P0001';
  END IF;

  NEW.team_id := v_team_id;
  NEW.recipient_id := v_user_id;
  NEW.read_at := NULL;
  NEW.created_at := now();
  NEW.updated_at := NEW.created_at;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."record_feedbacks_before_insert"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."record_feedbacks_before_insert"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_feedbacks_before_insert"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_feedbacks_before_insert"() FROM "authenticated";

DROP TRIGGER IF EXISTS "record_feedbacks_before_insert" ON "public"."record_feedbacks";
CREATE TRIGGER "record_feedbacks_before_insert"
  BEFORE INSERT ON "public"."record_feedbacks"
  FOR EACH ROW EXECUTE FUNCTION "public"."record_feedbacks_before_insert"();

-- -----------------------------------------------------------------------------
-- BEFORE UPDATE: 本文の変更で未読に戻し updated_at を進める
-- -----------------------------------------------------------------------------
-- 列単位 GRANT でクライアントは content しか更新できないが、SECURITY DEFINER の
-- RPC や service_role の誤用に備えて、識別列はここでも固定する。
CREATE OR REPLACE FUNCTION "public"."record_feedbacks_before_update"()
RETURNS trigger
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.record_id := OLD.record_id;
  NEW.team_id := OLD.team_id;
  NEW.recipient_id := OLD.recipient_id;
  NEW.created_at := OLD.created_at;
  -- author_id は users 削除時の ON DELETE SET NULL でだけ変わる
  IF NEW.author_id IS NOT NULL THEN
    NEW.author_id := OLD.author_id;
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.read_at := NULL;
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."record_feedbacks_before_update"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."record_feedbacks_before_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_feedbacks_before_update"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_feedbacks_before_update"() FROM "authenticated";

DROP TRIGGER IF EXISTS "record_feedbacks_before_update" ON "public"."record_feedbacks";
CREATE TRIGGER "record_feedbacks_before_update"
  BEFORE UPDATE ON "public"."record_feedbacks"
  FOR EACH ROW EXECUTE FUNCTION "public"."record_feedbacks_before_update"();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."record_feedbacks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Record feedbacks select policy" ON "public"."record_feedbacks";
CREATE POLICY "Record feedbacks select policy" ON "public"."record_feedbacks"
FOR SELECT TO "authenticated" USING (
  "recipient_id" = (SELECT "auth"."uid"())
  OR "public"."can_give_record_feedback"("team_id", (SELECT "auth"."uid"()))
);

DROP POLICY IF EXISTS "Record feedbacks insert policy" ON "public"."record_feedbacks";
CREATE POLICY "Record feedbacks insert policy" ON "public"."record_feedbacks"
FOR INSERT TO "authenticated" WITH CHECK (
  "author_id" = (SELECT "auth"."uid"())
  AND "recipient_id" <> (SELECT "auth"."uid"())
  AND "public"."can_give_record_feedback"("team_id", (SELECT "auth"."uid"()))
);

DROP POLICY IF EXISTS "Record feedbacks update policy" ON "public"."record_feedbacks";
CREATE POLICY "Record feedbacks update policy" ON "public"."record_feedbacks"
FOR UPDATE TO "authenticated" USING (
  "author_id" = (SELECT "auth"."uid"())
  AND "public"."can_give_record_feedback"("team_id", (SELECT "auth"."uid"()))
) WITH CHECK (
  "author_id" = (SELECT "auth"."uid"())
  AND "public"."can_give_record_feedback"("team_id", (SELECT "auth"."uid"()))
);

DROP POLICY IF EXISTS "Record feedbacks delete policy" ON "public"."record_feedbacks";
CREATE POLICY "Record feedbacks delete policy" ON "public"."record_feedbacks"
FOR DELETE TO "authenticated" USING (
  "author_id" = (SELECT "auth"."uid"())
  AND "public"."can_give_record_feedback"("team_id", (SELECT "auth"."uid"()))
);

-- -----------------------------------------------------------------------------
-- テーブル権限 (列単位)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."record_feedbacks" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."record_feedbacks" FROM "anon";
REVOKE ALL ON TABLE "public"."record_feedbacks" FROM "authenticated";
GRANT SELECT, DELETE ON TABLE "public"."record_feedbacks" TO "authenticated";
GRANT INSERT ("record_id", "author_id", "content") ON TABLE "public"."record_feedbacks" TO "authenticated";
GRANT UPDATE ("content") ON TABLE "public"."record_feedbacks" TO "authenticated";
GRANT ALL ON TABLE "public"."record_feedbacks" TO "service_role";

-- -----------------------------------------------------------------------------
-- RPC: 記録1件の FB 一覧 (書いた人の名前付き)
-- -----------------------------------------------------------------------------
-- users の SELECT RLS は「現役で同じチーム」が条件なので、書いた管理者が退団すると
-- 選手から名前が引けなくなる。この RPC が名前を返す。
-- 閲覧権限 (本人 or 同チーム管理者) は WHERE で絞る。権限の無い行は単に返らない。
CREATE OR REPLACE FUNCTION "public"."get_record_feedbacks"(
  "p_record_id" "uuid"
) RETURNS TABLE (
  "id"                         "uuid",
  "record_id"                  "uuid",
  "team_id"                    "uuid",
  "recipient_id"               "uuid",
  "author_id"                  "uuid",
  "author_name"                "text",
  "author_profile_image_path"  "text",
  "content"                    "text",
  "read_at"                    timestamp with time zone,
  "created_at"                 timestamp with time zone,
  "updated_at"                 timestamp with time zone
)
    LANGUAGE "plpgsql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.record_id,
    f.team_id,
    f.recipient_id,
    f.author_id,
    u.name,
    u.profile_image_path,
    f.content,
    f.read_at,
    f.created_at,
    f.updated_at
  FROM public.record_feedbacks f
  LEFT JOIN public.users u ON u.id = f.author_id
  WHERE f.record_id = p_record_id
    AND (
      f.recipient_id = v_caller
      OR public.can_give_record_feedback(f.team_id, v_caller)
    )
  ORDER BY f.created_at ASC, f.id ASC;
END;
$$;

ALTER FUNCTION "public"."get_record_feedbacks"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_record_feedbacks"("uuid") IS '記録1件のフィードバック一覧を書いた人の名前付きで返す。閲覧できるのは選手本人と同チームの承認済み・現役の管理者だけ (権限の無い行は返らない)';

REVOKE ALL ON FUNCTION "public"."get_record_feedbacks"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_record_feedbacks"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_record_feedbacks"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_record_feedbacks"("uuid") TO "service_role";

-- -----------------------------------------------------------------------------
-- RPC: 自分宛ての未読 FB (ダッシュボードのポップアップ用)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_unread_record_feedbacks"()
RETURNS TABLE (
  "id"                 "uuid",
  "record_id"          "uuid",
  "team_id"            "uuid",
  "author_id"          "uuid",
  "author_name"        "text",
  "updated_at"         timestamp with time zone,
  "competition_id"     "uuid",
  "competition_title"  "text",
  "competition_date"   "date",
  "style_id"           integer,
  "time"               numeric,
  "pool_type"          smallint,
  "is_relaying"        boolean,
  "record_created_at"  timestamp with time zone
)
    LANGUAGE "plpgsql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.record_id,
    f.team_id,
    f.author_id,
    u.name,
    f.updated_at,
    r.competition_id,
    c.title,
    c.date,
    r.style_id,
    r.time,
    r.pool_type,
    r.is_relaying,
    r.created_at
  FROM public.record_feedbacks f
  JOIN public.records r ON r.id = f.record_id
  LEFT JOIN public.competitions c ON c.id = r.competition_id
  LEFT JOIN public.users u ON u.id = f.author_id
  WHERE f.recipient_id = v_caller
    AND f.read_at IS NULL
  ORDER BY f.updated_at DESC, f.id ASC;
END;
$$;

ALTER FUNCTION "public"."get_unread_record_feedbacks"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_unread_record_feedbacks"() IS '自分宛ての未読フィードバックを、大会名・種目・タイム付きで新しい順に返す (ダッシュボードのポップアップ用)';

REVOKE ALL ON FUNCTION "public"."get_unread_record_feedbacks"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_unread_record_feedbacks"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_unread_record_feedbacks"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_unread_record_feedbacks"() TO "service_role";

-- -----------------------------------------------------------------------------
-- RPC: 記録1件の自分宛ての未読 FB を既読にする
-- -----------------------------------------------------------------------------
-- 戻り値: 既読にした件数
CREATE OR REPLACE FUNCTION "public"."mark_record_feedbacks_read"(
  "p_record_id" "uuid"
) RETURNS integer
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
  v_count integer;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.record_feedbacks
  SET read_at = now()
  WHERE record_id = p_record_id
    AND recipient_id = v_caller
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION "public"."mark_record_feedbacks_read"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."mark_record_feedbacks_read"("uuid") IS '記録1件について、自分宛ての未読フィードバックを既読にする。戻り値は既読にした件数';

REVOKE ALL ON FUNCTION "public"."mark_record_feedbacks_read"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."mark_record_feedbacks_read"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."mark_record_feedbacks_read"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_record_feedbacks_read"("uuid") TO "service_role";
