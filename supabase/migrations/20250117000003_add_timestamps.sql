-- =============================================================================
-- タイムスタンプカラムの追加マイグレーション
-- 全テーブルにcreated_atとupdated_atを統一
-- =============================================================================

-- competitionsテーブルにタイムスタンプを追加
ALTER TABLE competitions 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- recordsテーブルにタイムスタンプを追加
ALTER TABLE records 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- split_timesテーブルにタイムスタンプを追加
ALTER TABLE split_times 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- practice_log_tagsテーブルにupdated_atを追加
ALTER TABLE practice_log_tags 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- user_sessionsテーブルにupdated_atを追加
ALTER TABLE user_sessions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- =============================================================================
-- 更新日時トリガーの追加
-- =============================================================================

-- competitionsテーブルの更新日時トリガー
CREATE TRIGGER update_competitions_updated_at BEFORE UPDATE ON competitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- recordsテーブルの更新日時トリガー
CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- split_timesテーブルの更新日時トリガー
CREATE TRIGGER update_split_times_updated_at BEFORE UPDATE ON split_times
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- practice_log_tagsテーブルの更新日時トリガー
CREATE TRIGGER update_practice_log_tags_updated_at BEFORE UPDATE ON practice_log_tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- user_sessionsテーブルの更新日時トリガー
CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 既存データのタイムスタンプを設定（必要に応じて）
-- =============================================================================

-- 既存のrecordsデータにcreated_atを設定（competition_idがある場合は大会日時を使用）
UPDATE records 
SET created_at = (
    SELECT c.created_at 
    FROM competitions c 
    WHERE c.id = records.competition_id
)
WHERE created_at IS NULL 
  AND competition_id IS NOT NULL;

-- 既存のrecordsデータにcreated_atを設定（デフォルト値）
UPDATE records 
SET created_at = NOW() - INTERVAL '1 year'
WHERE created_at IS NULL;

-- 既存のsplit_timesデータにcreated_atを設定
UPDATE split_times 
SET created_at = (
    SELECT r.created_at 
    FROM records r 
    WHERE r.id = split_times.record_id
)
WHERE created_at IS NULL;

-- 既存のcompetitionsデータにcreated_atを設定
UPDATE competitions 
SET created_at = date::timestamp with time zone
WHERE created_at IS NULL;

-- =============================================================================
-- インデックスの追加（パフォーマンス向上）
-- =============================================================================

-- タイムスタンプでの検索用インデックス
CREATE INDEX IF NOT EXISTS idx_competitions_created_at ON competitions(created_at);
CREATE INDEX IF NOT EXISTS idx_competitions_updated_at ON competitions(updated_at);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at);
CREATE INDEX IF NOT EXISTS idx_split_times_created_at ON split_times(created_at);
CREATE INDEX IF NOT EXISTS idx_split_times_updated_at ON split_times(updated_at);
CREATE INDEX IF NOT EXISTS idx_practice_log_tags_updated_at ON practice_log_tags(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_updated_at ON user_sessions(updated_at);

-- =============================================================================
-- マイグレーション完了
-- =============================================================================
