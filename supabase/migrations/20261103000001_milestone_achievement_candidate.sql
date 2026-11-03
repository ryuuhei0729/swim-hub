-- =============================================================================
-- マイルストーン: 達成の確認ダイアログ (達成候補) と、タイム目標の練習タイム目標への統合
-- =============================================================================
-- 1. 達成候補の列を追加する
--    mobile は判定で条件を満たす記録を見つけても自動で達成にせず、候補として
--    achievement_candidate に根拠 (practice_log_id / record_id / achieved_value / detected_at)
--    を置き、「もしかしてマイルストーンを達成しましたか？」で「達成！」を押したときに確定する。
--    「キャンセル」した日時を candidate_dismissed_at に残し、それ以前に登録した記録では
--    再び候補にしない (同じ記録で何度もダイアログを出さない)。
--    web は従来どおり自動で達成にする (候補は使わない)。
--
-- 2. 旧「タイム目標」(type = 'time') を練習タイム目標 (type = 'reps_time' の 1本×1セット) に変換する
--    1本×1セットの reps_time は、旧 time と同じく練習タイム1本 + 大会記録で判定する。
--    CHECK 制約の 'time' は外さない: 配布済みの古いアプリがまだ time で作成するため。
--    新しいコードは time を読むときも reps_time (1本×1セット) として扱う。
-- =============================================================================

ALTER TABLE "public"."milestones"
  ADD COLUMN IF NOT EXISTS "achievement_candidate" JSONB NULL,
  ADD COLUMN IF NOT EXISTS "candidate_dismissed_at" TIMESTAMP WITH TIME ZONE NULL;

UPDATE "public"."milestones"
SET
  "type" = 'reps_time',
  "params" = jsonb_build_object(
    'distance', "params"->'distance',
    'reps', 1,
    'sets', 1,
    'target_average_time', "params"->'target_time',
    'style', "params"->'style',
    'swim_category', "params"->'swim_category',
    'circle', 0
  )
WHERE "type" = 'time'
  AND "params" ? 'target_time';
