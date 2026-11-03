-- =============================================================================
-- マイルストーンに「その他」タイプ (type = 'other') を追加する
-- =============================================================================
-- 「ベンチプレス100kg×2」「ランニング毎日達成」のような、練習記録から自動判定できない
-- 自由記述の目標を置けるようにする。内容は milestones.title に保存し、params は空オブジェクト。
-- 達成判定は自動では行わず、ユーザーが手動で完了 (status = 'achieved') にする。
--
-- 元の制約: 20260115020000_add_goals_feature.sql の列制約
--   type TEXT NOT NULL CHECK (type IN ('time', 'reps_time', 'set'))
-- (列制約の自動命名 milestones_type_check)
-- =============================================================================

ALTER TABLE "public"."milestones" DROP CONSTRAINT IF EXISTS "milestones_type_check";

ALTER TABLE "public"."milestones"
  ADD CONSTRAINT "milestones_type_check"
  CHECK ("type" IN ('time', 'reps_time', 'set', 'other'));
