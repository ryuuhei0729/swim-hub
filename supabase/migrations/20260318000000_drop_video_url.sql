-- video_url カラム削除（Step 7のコード変更完了後に適用）
ALTER TABLE records DROP COLUMN IF EXISTS video_url;
