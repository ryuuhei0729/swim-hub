-- competitionsテーブルにgoogle_event_idカラムを追加
ALTER TABLE competitions 
ADD COLUMN google_event_id TEXT;

-- practicesテーブルにgoogle_event_idカラムを追加
ALTER TABLE practices 
ADD COLUMN google_event_id TEXT;

-- インデックスを追加（検索性能向上）
CREATE INDEX idx_competitions_google_event_id ON competitions(google_event_id);
CREATE INDEX idx_practices_google_event_id ON practices(google_event_id);
