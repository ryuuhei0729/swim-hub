-- =============================================================================
-- 保護者アカウントを、本人以外の誰からも見えないようにする
-- =============================================================================
-- 20261129000000_add_guardian_role.sql で保護者 (team_memberships.role = 'guardian') を
-- 追加し、アプリの画面 (メンバー一覧・出欠・代理入力の候補) からは除外した。
-- ただし DB を直接読むと (PostgREST を直接叩くなど) まだ見えていた:
--   - team_memberships: 同じチームの承認済みメンバーは全員の行を読めるため、
--     保護者の行 (role = guardian) も読めた
--   - users: shares_active_team() で「同じチームに現役で所属」と判定されるため、
--     保護者のプロフィール (名前) も読めた
-- 選手側から保護者の存在が分からないよう、DB でも本人以外には返さない。
--
-- 保護者本人からの見え方は変えない:
--   - 自分の membership 行は読める (保護者版の画面がどのチームを出すかに使う)
--   - チームメンバーと記録は今まで通り読める (is_team_member / shares_active_team の
--     「見る側」は guardian を含めたまま)
-- 管理者・チーム作成者からも保護者の行は見えなくなる。保護者の登録・解除は当面
-- DB を直接操作する運用なので問題ない。画面から管理するようになったら、
-- SECURITY DEFINER の RPC で行うこと (SELECT を開け直さない)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. team_memberships: 保護者の行は本人にだけ返す
-- -----------------------------------------------------------------------------
-- 本人の枝以外を role <> 'guardian' で包む。それ以外の条件は既存のポリシー
-- (20251201014342_initial_schema.sql) と同じ。
DROP POLICY IF EXISTS "Users can view team memberships" ON "public"."team_memberships";

CREATE POLICY "Users can view team memberships" ON "public"."team_memberships"
FOR SELECT USING (
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    "role" <> 'guardian'
    AND
    (
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
    )
  )
);

-- -----------------------------------------------------------------------------
-- 2. shares_active_team: 保護者としての所属は「見られる側」に数えない
-- -----------------------------------------------------------------------------
-- users (プロフィール) と records (個人記録) の SELECT ポリシーが使う。
-- 見られる側 (target) の所属から guardian を除くので、保護者のプロフィールは
-- チームメンバーに返らない。見る側 (viewer) は guardian を含めたままなので、
-- 保護者はチームメンバーのプロフィール・個人記録を今まで通り読める。
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
      AND tm_target.role <> 'guardian'
  );
$$;

COMMENT ON FUNCTION "public"."shares_active_team"("target_user_id" "uuid", "viewer_user_id" "uuid") IS '2人のユーザーが同じチームにアクティブ所属しているかを判定する。見られる側 (target) の保護者 (role = guardian) としての所属は数えない (保護者を他のメンバーから見せないため)';
