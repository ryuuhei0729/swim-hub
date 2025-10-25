-- =============================================================================
-- 出欠ステータスカラムの追加
-- competitionsとpracticesテーブルに出欠提出期間を管理するカラムを追加
-- =============================================================================

-- ENUM型を作成
CREATE TYPE attendance_status_type AS ENUM ('before', 'open', 'closed');

-- competitionsテーブルにattendance_statusを追加
ALTER TABLE competitions
ADD COLUMN attendance_status attendance_status_type DEFAULT 'before';

-- practicesテーブルにattendance_statusを追加
ALTER TABLE practices
ADD COLUMN attendance_status attendance_status_type DEFAULT 'before';

-- インデックスを追加（検索パフォーマンス向上）
CREATE INDEX idx_competitions_attendance_status ON competitions(attendance_status);
CREATE INDEX idx_practices_attendance_status ON practices(attendance_status);

-- コメント追加
COMMENT ON COLUMN competitions.attendance_status IS '出欠提出ステータス: before=提出前, open=提出受付中, closed=提出締切';
COMMENT ON COLUMN practices.attendance_status IS '出欠提出ステータス: before=提出前, open=提出受付中, closed=提出締切';
COMMENT ON COLUMN competitions.entry_status IS 'エントリーステータス: before=エントリー前, open=エントリー受付中, closed=エントリー締切';

-- 既存のチーム大会・チーム練習のattendance_statusをopenに設定
UPDATE competitions
SET attendance_status = 'open'
WHERE team_id IS NOT NULL;

UPDATE practices
SET attendance_status = 'open'
WHERE team_id IS NOT NULL;

