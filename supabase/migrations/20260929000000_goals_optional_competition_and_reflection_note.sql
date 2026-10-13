-- =============================================================================
-- 目標管理 本導入: goals.competition_id を nullable 化 + reflection_note 追加 + RLS 強化
-- =============================================================================
--
-- 背景 (PM 裁定 P1/P2/P3):
--   P1: 個人大会削除時に records だけでなく紐づく goals も削除する方針 (別 migration の
--       delete_competition_with_records RPC 改修で対応)。チーム大会削除・チーム自体の
--       削除では goals を残し「大会情報なし」表示にするため、FK を
--       ON DELETE CASCADE → ON DELETE SET NULL に変更し、competition_id を NULL 許容にする。
--   P2: goals の INSERT/UPDATE で competition_id が「実在し RLS 経由で見える competitions」
--       を指すことを強制する。invoker 権限で実行されるサブクエリのため、
--       20260705000000 の competitions SELECT RLS (本人 or チームメンバー or チーム管理者) が
--       そのまま適用される。チーム退会後は UPDATE の WITH CHECK が失敗し、
--       既存の competition_id を維持したままの更新 (target_time 変更等) も拒否される
--       (呼び出し側 (Web Developer 実装) が生エラーを出さず処理する)。
--   P3: GoalReflectionModal の「未達成」振り返りメモを保存できるよう
--       reflection_note 列を追加する (milestones.reflection_note と同型)。
--
-- デプロイ順序: このファイル → アプリケーションコード
-- (INSERT/UPDATE の WITH CHECK が先に強まるため、新しい WITH CHECK を満たさない
--  書き込みは移行期間中 REST 側で拒否されうるが、既存の正常な書き込み
--  (実在する competition_id を指す INSERT/UPDATE) は従来どおり通る)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. competition_id を nullable にし、FK を ON DELETE SET NULL に変更
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."goals" DROP CONSTRAINT IF EXISTS "goals_competition_id_fkey";
ALTER TABLE "public"."goals" ALTER COLUMN "competition_id" DROP NOT NULL;
ALTER TABLE "public"."goals"
  ADD CONSTRAINT "goals_competition_id_fkey"
  FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 2. reflection_note 列を追加 (milestones.reflection_note と同型)
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."goals" ADD COLUMN IF NOT EXISTS "reflection_note" text NULL;

-- -----------------------------------------------------------------------------
-- 3. INSERT ポリシー: competition_id が実在し RLS 経由で見える競技会を指すことを要求
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create their own goals" ON "public"."goals";
CREATE POLICY "Users can create their own goals"
  ON "public"."goals" FOR INSERT
  WITH CHECK (
    (select auth.uid()) = "user_id"
    AND "competition_id" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "public"."competitions" c WHERE c.id = "goals"."competition_id")
  );

-- -----------------------------------------------------------------------------
-- 4. UPDATE ポリシー: WITH CHECK を新設し、competition_id が NULL か
--    実在し RLS 経由で見える競技会を指すことのいずれかを要求する。
--    (USING は行の読み取り許可条件のまま維持: 本人の goals のみ更新対象にできる)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own goals" ON "public"."goals";
CREATE POLICY "Users can update their own goals"
  ON "public"."goals" FOR UPDATE
  USING ((select auth.uid()) = "user_id")
  WITH CHECK (
    (select auth.uid()) = "user_id"
    AND (
      "competition_id" IS NULL
      OR EXISTS (SELECT 1 FROM "public"."competitions" c WHERE c.id = "goals"."competition_id")
    )
  );
