-- =============================================================================
-- 削除がエラーで止まる2つの不具合を直す
--
-- 1. milestone_achievements.check_source
--    変更前: 「practice_log_id と record_id のどちらか一方だけが入っている」。
--      一方で両方の FK は ON DELETE SET NULL のため、達成の根拠になった練習ログ・記録を
--      消すと両方 NULL になり CHECK 違反 (23514) になる。結果として次の操作が失敗していた:
--        - 達成の根拠になった練習を保存し直す (replace_practice_logs はログを全件消して入れ直す)
--        - その記録・練習ログの削除、その記録を含む大会の削除 (delete_competition_with_records)
--      milestone_achievements には DELETE ポリシーが無く、アプリから先に消して回避もできない。
--    変更後: 「両方同時には入らない」だけを保証する。根拠が消えた達成行は両方 NULL で残る。
--      達成時のタイム等は achieved_value に入っているので、達成の履歴は失われない。
--      CASCADE にしないのは、練習を保存し直すたびに達成履歴が黙って消えるため。
--
-- 2. enforce_teams_identity_immutable (teams の BEFORE UPDATE トリガ)
--    変更前: created_by の変更を一律に拒否する。teams.created_by の FK は ON DELETE SET NULL
--      なので、チームを作ったユーザーを削除すると FK の SET NULL がこのトリガに拒否され、
--      アカウント削除 (auth.admin.deleteUser) が失敗していた (20260916 の導入以降)。
--    変更後: 「参照先のユーザーが既に存在しない状態で NULL にする」更新 (= FK の SET NULL) だけは通す。
--      ユーザーが存在する間に created_by を NULL や別人に変える更新は従来どおり拒否する。
--      存在確認が users の RLS に左右されないよう SECURITY DEFINER にする (INVOKER のままだと、
--      作成者の行が見えない管理者からは「存在しない」に見え、created_by を NULL にできてしまう)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. milestone_achievements
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."milestone_achievements" DROP CONSTRAINT IF EXISTS "check_source";
ALTER TABLE "public"."milestone_achievements"
  ADD CONSTRAINT "check_source" CHECK (NOT ("practice_log_id" IS NOT NULL AND "record_id" IS NOT NULL));

COMMENT ON CONSTRAINT "check_source" ON "public"."milestone_achievements" IS
  '根拠は練習ログか記録のどちらか一方。根拠が削除されると両方 NULL になり、達成値は achieved_value に残る';

-- -----------------------------------------------------------------------------
-- 2. enforce_teams_identity_immutable
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."enforce_teams_identity_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  -- IS DISTINCT FROM を使う: created_by は NULLABLE であり、`<>` では
  -- NULL 絡みの比較が NULL になって IF を素通りする (fail open)。
  IF NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
    -- 作成者のアカウント削除に伴う FK の SET NULL だけは通す。
    -- FK の参照動作は users の行が消えた後に走るので、この時点で OLD.created_by の行は存在しない。
    IF NOT (
      NEW."created_by" IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD."created_by")
    ) THEN
      RAISE EXCEPTION 'チームの作成者は変更できません';
    END IF;
  END IF;

  IF NEW."invite_code" IS DISTINCT FROM OLD."invite_code" THEN
    RAISE EXCEPTION '招待コードは変更できません';
  END IF;

  RETURN NEW;
END;
$$;

-- トリガ専用。SECURITY DEFINER になったので API からは呼べなくする (トリガの発火に EXECUTE 権限は要らない)
REVOKE ALL ON FUNCTION "public"."enforce_teams_identity_immutable"() FROM PUBLIC, "anon", "authenticated";
