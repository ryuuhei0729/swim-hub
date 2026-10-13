-- =============================================================================
-- milestone_achievements の重複防止用インデックス追加
-- =============================================================================
--
-- 背景:
--   アプリ側 (GoalAPI.updateAllMilestoneStatuses) は達成記録の INSERT 前に
--   同じ (milestone_id, practice_log_id) / (milestone_id, record_id) の行が
--   既に存在するか SELECT で確認しているが、SELECT と INSERT の間に原子性が無く、
--   DB 側の UNIQUE 制約も無いため、2タブを同時に開く等で同時実行されると
--   同一の達成記録が重複して作成されうる。
--
--   milestone_achievements.practice_log_id / record_id は
--   check_source CHECK 制約 (20260115020000) によりどちらか一方のみが
--   NOT NULL になる (両方 NULL・両方非 NULL は存在しない) ため、
--   部分 UNIQUE インデックスを列ごとに1本ずつ (計2本) 用意すれば
--   アプリ側の重複確認と同じ単位で重複を防げる。
--
--   本番に目標データが無いため、適用時点で既存の重複行がインデックス作成に
--   失敗する心配はない。
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "milestone_achievements_practice_log_unique_idx"
    ON "public"."milestone_achievements" ("milestone_id", "practice_log_id")
    WHERE "practice_log_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "milestone_achievements_record_unique_idx"
    ON "public"."milestone_achievements" ("milestone_id", "record_id")
    WHERE "record_id" IS NOT NULL;
