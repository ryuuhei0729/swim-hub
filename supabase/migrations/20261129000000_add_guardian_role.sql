-- =============================================================================
-- 保護者アカウント (team_memberships.role = 'guardian')
-- =============================================================================
-- 保護者はチームの記録・予定・ランキングを「見るだけ」のアカウント。
-- 当面は運用者が DB を直接操作して保護者にする (追加の画面はまだ無い):
--
--   INSERT INTO public.team_memberships (team_id, user_id, role, status, is_active, is_swimmer)
--   VALUES ('<チームID>', '<保護者アカウントの user_id>', 'guardian', 'approved', true, false);
--
-- 保護者アカウントは次のように扱う:
--   - 閲覧: 既存の RLS (is_team_member / shares_active_team) はロールを見ないため、
--     チームメンバーと同じ範囲が見える。追加の SELECT ポリシーは不要。
--   - 書き込み: 一切できない。public の全テーブルに statement 単位の BEFORE トリガ
--     (guardian_read_only_guard) を付けて INSERT / UPDATE / DELETE を拒否する。
--     RLS のポリシーではなくトリガにしているのは、SECURITY DEFINER の RPC
--     (replace_practice_logs, request_join_team など) は RLS を通らずに書き込むため。
--     トリガは RPC の中の書き込みでも発火し、auth.uid() は JWT の値のままなので
--     「保護者のリクエストから来た書き込み」をまとめて止められる。
--     service_role (Web の API ルート・Edge Functions・webhook) と cron は JWT の sub を
--     持たないので止まらない。API ルート側は別途 guardian を拒否している。
--   - ログイン情報: auth.users のメールアドレス・パスワードの変更と削除を拒否する
--     (共有アカウントなので、誰かが変えると他の保護者が入れなくなる)。
--     運用者が変えるときは同じトランザクションで
--       SET LOCAL swimhub.allow_guardian_credential_change = 'on';
--     を実行してから更新する。保護者を解除 (membership を削除) した後なら制限は無い。
--   - 生徒側からは見せない: 練習・大会を作ったときの出欠行の自動作成から外す。
--     メンバー一覧からの除外はアプリ側 (TeamMembersAPI.list / fetchTeamMembers) で行う。
--     保護者は必ず非泳者 (is_swimmer = false) にし、ランキング・入力候補からも外す。
--
-- 今後テーブルを足したときは、この migration の末尾と同じトリガを付けること。
-- supabase/tests/25_guardian_read_only.test.sql が「トリガの無いテーブル」を検出して落ちる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. role に guardian を追加し、保護者は必ず非泳者にする
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."team_memberships"
  DROP CONSTRAINT IF EXISTS "team_memberships_role_check";
ALTER TABLE "public"."team_memberships"
  ADD CONSTRAINT "team_memberships_role_check"
  CHECK ("role" = ANY (ARRAY['admin'::"text", 'user'::"text", 'guardian'::"text"]));

ALTER TABLE "public"."team_memberships"
  DROP CONSTRAINT IF EXISTS "team_memberships_guardian_not_swimmer";
ALTER TABLE "public"."team_memberships"
  ADD CONSTRAINT "team_memberships_guardian_not_swimmer"
  CHECK ("role" <> 'guardian' OR "is_swimmer" = false);

COMMENT ON COLUMN "public"."team_memberships"."role" IS 'admin = 管理者, user = 一般メンバー, guardian = 保護者 (閲覧専用。書き込みは guardian_read_only_guard トリガで拒否される)';

-- -----------------------------------------------------------------------------
-- 2. 判定関数
-- -----------------------------------------------------------------------------
-- 任意の user_id を受け取る版は内部用。authenticated に開けると
-- 「誰が保護者アカウントか」を問い合わせられてしまうため EXECUTE を渡さない。
CREATE OR REPLACE FUNCTION "public"."is_guardian_user"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = p_user_id
      AND tm.role = 'guardian'
      AND tm.status = 'approved'
      AND tm.is_active = true
  );
$$;

ALTER FUNCTION "public"."is_guardian_user"("uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."is_guardian_user"("uuid") IS '指定ユーザーが保護者アカウント (承認済み・現役の guardian membership を持つ) かを判定する。内部用 (トリガ・他の関数から呼ぶ)。';

REVOKE ALL ON FUNCTION "public"."is_guardian_user"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_guardian_user"("uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_guardian_user"("uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_guardian_user"("uuid") TO "service_role";

-- 呼び出し元自身が保護者か。アプリが保護者版の画面に切り替えるために呼ぶ。
CREATE OR REPLACE FUNCTION "public"."is_guardian_account"() RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT public.is_guardian_user((SELECT auth.uid()));
$$;

ALTER FUNCTION "public"."is_guardian_account"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."is_guardian_account"() IS '呼び出し元 (auth.uid()) が保護者アカウントかを返す。未ログインは false。';

REVOKE ALL ON FUNCTION "public"."is_guardian_account"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_guardian_account"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."is_guardian_account"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_guardian_account"() TO "service_role";

-- -----------------------------------------------------------------------------
-- 3. 書き込み拒否トリガ (public の全テーブル)
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER にしているのは、anon など is_guardian_account の EXECUTE を
-- 持たないロールの書き込みでもトリガが失敗しないようにするため。
CREATE OR REPLACE FUNCTION "public"."guardian_read_only_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  IF public.is_guardian_account() THEN
    RAISE EXCEPTION 'guardian accounts are read-only'
      USING ERRCODE = '42501',
            HINT = 'guardian_read_only';
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."guardian_read_only_guard"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."guardian_read_only_guard"() IS '保護者アカウントからの INSERT / UPDATE / DELETE を拒否する (statement 単位の BEFORE トリガ)。SECURITY DEFINER の RPC の中の書き込みにも効く。';

REVOKE ALL ON FUNCTION "public"."guardian_read_only_guard"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."guardian_read_only_guard"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."guardian_read_only_guard"() FROM "authenticated";

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guardian_read_only_guard ON public.%I', r.relname);
    EXECUTE format(
      'CREATE TRIGGER guardian_read_only_guard '
      'BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guardian_read_only_guard()',
      r.relname
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Storage (Supabase Storage のバケット) も書き込み不可にする
-- -----------------------------------------------------------------------------
-- storage.objects は Storage サービスの持ち物でトリガを付けられないため、
-- RESTRICTIVE ポリシーで既存の許可ポリシーと AND を取る。
DROP POLICY IF EXISTS "Guardian accounts cannot insert objects" ON "storage"."objects";
CREATE POLICY "Guardian accounts cannot insert objects" ON "storage"."objects"
  AS RESTRICTIVE FOR INSERT TO "authenticated"
  WITH CHECK (NOT public.is_guardian_account());

DROP POLICY IF EXISTS "Guardian accounts cannot update objects" ON "storage"."objects";
CREATE POLICY "Guardian accounts cannot update objects" ON "storage"."objects"
  AS RESTRICTIVE FOR UPDATE TO "authenticated"
  USING (NOT public.is_guardian_account())
  WITH CHECK (NOT public.is_guardian_account());

DROP POLICY IF EXISTS "Guardian accounts cannot delete objects" ON "storage"."objects";
CREATE POLICY "Guardian accounts cannot delete objects" ON "storage"."objects"
  AS RESTRICTIVE FOR DELETE TO "authenticated"
  USING (NOT public.is_guardian_account());

-- -----------------------------------------------------------------------------
-- 5. 練習・大会の出欠行の自動作成から保護者を外す
-- -----------------------------------------------------------------------------
-- 本体は 20251201014342_initial_schema.sql と同じ。条件に role <> 'guardian' を足しただけ。
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
    AND tm.is_active = true
    AND tm.role <> 'guardian';
  END IF;
  RETURN NEW;
END;
$$;

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
    AND tm.is_active = true
    AND tm.role <> 'guardian';
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. 保護者アカウントのログイン情報を変えさせない (auth.users)
-- -----------------------------------------------------------------------------
-- Supabase Auth (GoTrue) は JWT を持たない接続で auth.users を更新するため、
-- auth.uid() ではなく更新対象の行 (OLD.id) で判定する。
-- email_change はメール変更の申請 (確認メール送信) で入る列。申請の時点で止める。
CREATE OR REPLACE FUNCTION "public"."guardian_protect_credentials"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  IF current_setting('swimhub.allow_guardian_credential_change', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT public.is_guardian_user(OLD.id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'guardian accounts cannot be deleted'
      USING ERRCODE = '42501',
            HINT = 'guardian_read_only';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
     OR (NEW.email_change IS DISTINCT FROM OLD.email_change AND COALESCE(NEW.email_change, '') <> '')
  THEN
    RAISE EXCEPTION 'guardian account credentials cannot be changed'
      USING ERRCODE = '42501',
            HINT = 'guardian_read_only';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."guardian_protect_credentials"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."guardian_protect_credentials"() IS '保護者アカウントのメールアドレス・パスワードの変更と削除を拒否する。運用者は SET LOCAL swimhub.allow_guardian_credential_change = ''on'' で一時的に外せる。';

REVOKE ALL ON FUNCTION "public"."guardian_protect_credentials"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."guardian_protect_credentials"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."guardian_protect_credentials"() FROM "authenticated";

DROP TRIGGER IF EXISTS "guardian_protect_credentials" ON "auth"."users";
CREATE TRIGGER "guardian_protect_credentials"
  BEFORE UPDATE OR DELETE ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."guardian_protect_credentials"();
