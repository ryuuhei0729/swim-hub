-- records: video_path + video_thumbnail_path 追加
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS video_path text,
  ADD COLUMN IF NOT EXISTS video_thumbnail_path text;

-- practice_logs: video_path + video_thumbnail_path 追加
ALTER TABLE practice_logs
  ADD COLUMN IF NOT EXISTS video_path text,
  ADD COLUMN IF NOT EXISTS video_thumbnail_path text;

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_records_video_path
  ON records(video_path) WHERE video_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_practice_logs_video_path
  ON practice_logs(video_path) WHERE video_path IS NOT NULL;
