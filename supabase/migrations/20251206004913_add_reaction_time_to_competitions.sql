-- competitionsテーブルからreaction_timeカラムを削除（誤って追加してしまったため）
ALTER TABLE "public"."competitions"
DROP COLUMN IF EXISTS "reaction_time";

-- recordsテーブルにreaction_timeカラムを追加
-- 反応時間（リアクションタイム）を記録するためのカラム
-- 範囲: 0.40~1.00秒程度

ALTER TABLE "public"."records"
ADD COLUMN "reaction_time" numeric(10,2);

COMMENT ON COLUMN "public"."records"."reaction_time" IS '反応時間（リアクションタイム）を秒単位で記録。範囲は0.40~1.00秒程度。';
