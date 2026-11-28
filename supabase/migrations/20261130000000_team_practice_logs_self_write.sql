-- =============================================================================
-- チーム練習のログは「本人の分だけ書ける・管理者は代理入力できる」に揃える
-- チーム練習・チーム大会の作成は管理者だけにする
-- (ryuuhei0729/swimhub-tasks#139)
--
-- 仕様 (2026-11-28 決定):
--   - 自分の記録は追加・編集・削除できる
--   - 他人の記録は読めるが、追加・編集・削除はできない (読む権限はこの migration では変えない)
--   - 管理者の代理入力は残す
--   - チーム練習・チーム大会そのものを作れるのは管理者だけ
--
-- 変更前:
--   - practice_logs の INSERT / DELETE は「練習の作成者」か「管理者の代理」だけ
--     (20260903000000)。一般メンバーは、管理者が作ったチーム練習に自分のログを付けられない。
--     逆に、チーム練習を作ったメンバーは、その練習に付いた他人のログも追加・削除できた。
--   - practice_times / practice_log_tags の UPDATE (と practice_log_tags の INSERT / DELETE) は
--     「練習の作成者」だけ (initial_schema)。
--   - team_id 付きの practices / competitions は一般メンバーも作れた (20260801000001)。
--
-- 変更後 (practice_logs / practice_times / practice_log_tags の INSERT / UPDATE / DELETE 共通):
--   書けるのは can_write_practice_log(練習, ログの持ち主) が true のときだけ。
--     (a) 個人練習 (team_id IS NULL): 練習の持ち主 (従来どおり)
--     (b) チーム練習: ログの持ち主が自分で、自分がそのチームの現役メンバー
--     (c) チーム練習: 自分がそのチームの現役管理者で、ログの持ち主もそのチームの現役メンバー (代理入力)
--   SELECT ポリシーは変えない。
--   一括の代理入力 RPC (replace_practice_logs) は SECURITY DEFINER で独自に認可しており影響しない。
--   保護者アカウントの書き込み禁止は guardian_read_only_guard トリガ側で行う (ポリシーでは見ない)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 判定関数
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."can_write_practice_log"("p_practice_id" "uuid", "p_log_user_id" "uuid")
RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices p
    WHERE p.id = p_practice_id
      AND (
        -- (a) 個人練習: 練習の持ち主
        (p.team_id IS NULL AND p.user_id = (SELECT auth.uid()))
        OR
        -- (b) チーム練習: 自分のログ
        (
          p.team_id IS NOT NULL
          AND p_log_user_id = (SELECT auth.uid())
          AND public.is_team_member(p.team_id, (SELECT auth.uid()))
        )
        OR
        -- (c) チーム練習: 管理者による代理
        (
          p.team_id IS NOT NULL
          AND public.is_team_admin(p.team_id, (SELECT auth.uid()))
          AND public.is_team_member(p.team_id, p_log_user_id)
        )
      )
  );
$$;

ALTER FUNCTION "public"."can_write_practice_log"("uuid", "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."can_write_practice_log"("uuid", "uuid") IS
  '呼び出し元が、その練習に付く「持ち主が p_log_user_id の練習ログ」(とそのタイム・タグ) を書けるか。個人練習は持ち主、チーム練習は本人か管理者の代理。RLS 用。';

REVOKE ALL ON FUNCTION "public"."can_write_practice_log"("uuid", "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_write_practice_log"("uuid", "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_write_practice_log"("uuid", "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_write_practice_log"("uuid", "uuid") TO "service_role";

-- -----------------------------------------------------------------------------
-- 2. practice_logs
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practice logs insert policy" ON public.practice_logs;
CREATE POLICY "Practice logs insert policy" ON public.practice_logs
FOR INSERT WITH CHECK (
  public.can_write_practice_log(practice_logs.practice_id, practice_logs.user_id)
);

-- USING は更新前の行、WITH CHECK は更新後の行で判定する
-- (他人のログへの付け替え・書けない練習への付け替えを防ぐ)
DROP POLICY IF EXISTS "Practice logs update policy" ON public.practice_logs;
CREATE POLICY "Practice logs update policy" ON public.practice_logs
FOR UPDATE
USING (
  public.can_write_practice_log(practice_logs.practice_id, practice_logs.user_id)
)
WITH CHECK (
  public.can_write_practice_log(practice_logs.practice_id, practice_logs.user_id)
);

DROP POLICY IF EXISTS "Practice logs delete policy" ON public.practice_logs;
CREATE POLICY "Practice logs delete policy" ON public.practice_logs
FOR DELETE USING (
  public.can_write_practice_log(practice_logs.practice_id, practice_logs.user_id)
);

-- -----------------------------------------------------------------------------
-- 3. practice_times (紐づく practice_log の持ち主で判定する)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practice times insert policy" ON public.practice_times;
CREATE POLICY "Practice times insert policy" ON public.practice_times
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_times.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
);

DROP POLICY IF EXISTS "Users can update own practice_times" ON public.practice_times;
DROP POLICY IF EXISTS "Practice times update policy" ON public.practice_times;
CREATE POLICY "Practice times update policy" ON public.practice_times
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_times.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_times.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
);

DROP POLICY IF EXISTS "Practice times delete policy" ON public.practice_times;
CREATE POLICY "Practice times delete policy" ON public.practice_times
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_times.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
);

-- -----------------------------------------------------------------------------
-- 4. practice_log_tags (紐づく practice_log の持ち主で判定する)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own practice_log_tags" ON public.practice_log_tags;
DROP POLICY IF EXISTS "Practice log tags insert policy" ON public.practice_log_tags;
CREATE POLICY "Practice log tags insert policy" ON public.practice_log_tags
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_log_tags.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
);

DROP POLICY IF EXISTS "Users can update own practice_log_tags" ON public.practice_log_tags;
DROP POLICY IF EXISTS "Practice log tags update policy" ON public.practice_log_tags;
CREATE POLICY "Practice log tags update policy" ON public.practice_log_tags
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_log_tags.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_log_tags.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
);

DROP POLICY IF EXISTS "Users can delete own practice_log_tags" ON public.practice_log_tags;
DROP POLICY IF EXISTS "Practice log tags delete policy" ON public.practice_log_tags;
CREATE POLICY "Practice log tags delete policy" ON public.practice_log_tags
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.practice_logs pl
    WHERE pl.id = practice_log_tags.practice_log_id
      AND public.can_write_practice_log(pl.practice_id, pl.user_id)
  )
);

-- -----------------------------------------------------------------------------
-- 5. チーム練習・チーム大会の作成は管理者だけ
--    個人 (team_id IS NULL) は従来どおり本人。管理者は従来どおり user_id を問わず作れる
--    (一括登録などで作成者を指定するため)。
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own practices" ON public.practices;
CREATE POLICY "Users can insert own practices" ON public.practices
FOR INSERT WITH CHECK (
  ("team_id" IS NULL AND "user_id" = (SELECT auth.uid()))
  OR
  ("team_id" IS NOT NULL AND public.is_team_admin("team_id", (SELECT auth.uid())))
);

DROP POLICY IF EXISTS "Users can create own competitions" ON public.competitions;
CREATE POLICY "Users can create own competitions" ON public.competitions
FOR INSERT WITH CHECK (
  ("team_id" IS NULL AND "user_id" = (SELECT auth.uid()))
  OR
  ("team_id" IS NOT NULL AND public.is_team_admin("team_id", (SELECT auth.uid())))
);
