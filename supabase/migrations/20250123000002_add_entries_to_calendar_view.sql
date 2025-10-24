-- =============================================================================
-- カレンダービューにエントリー情報を追加
-- エントリー済み・未記録の状態をカレンダーに表示できるようにする
-- 作成日: 2025年1月23日
-- =============================================================================

-- 既存のカレンダービューを削除
DROP VIEW IF EXISTS calendar_view;

-- カレンダービューを再作成（エントリー情報を含む）
CREATE OR REPLACE VIEW calendar_view AS
-- 個人練習
SELECT
  p.id,
  'practice' AS item_type,
  p.date AS item_date,
  '練習' AS title,
  p.place AS location,
  p.note,
  jsonb_build_object(
    'practice', row_to_json(p.*),
    'user_id', p.user_id
  ) AS metadata
FROM practices p
WHERE p.user_id = auth.uid() AND p.team_id IS NULL

UNION ALL

-- チーム練習
SELECT
  p.id,
  'team_practice' AS item_type,
  p.date AS item_date,
  'チーム練習' AS title,
  p.place AS location,
  p.note,
  jsonb_build_object(
    'practice', row_to_json(p.*),
    'user_id', p.user_id,
    'team_id', p.team_id
  ) AS metadata
FROM practices p
WHERE p.team_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = p.team_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  )

UNION ALL

-- 個人大会（記録なし・エントリーなし）
SELECT
  c.id,
  'competition' AS item_type,
  c.date AS item_date,
  c.title,
  c.place AS location,
  c.note,
  jsonb_build_object(
    'competition', row_to_json(c.*),
    'user_id', c.user_id,
    'pool_type', c.pool_type
  ) AS metadata
FROM competitions c
WHERE c.user_id = auth.uid()
  AND c.team_id IS NULL
  -- 記録もエントリーも存在しない
  AND NOT EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = c.id AND r.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM entries e
    WHERE e.competition_id = c.id AND e.user_id = auth.uid() AND e.team_id IS NULL
  )

UNION ALL

-- チーム大会（記録なし・エントリーなし）
SELECT
  c.id,
  'team_competition' AS item_type,
  c.date AS item_date,
  c.title,
  c.place AS location,
  c.note,
  jsonb_build_object(
    'competition', row_to_json(c.*),
    'user_id', c.user_id,
    'team_id', c.team_id,
    'pool_type', c.pool_type
  ) AS metadata
FROM competitions c
WHERE c.team_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = c.team_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  )
  -- 記録もエントリーも存在しない
  AND NOT EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = c.id AND r.user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM entries e
    WHERE e.competition_id = c.id AND e.user_id = auth.uid() AND e.team_id IS NOT NULL
  )

UNION ALL

-- 個人エントリー（記録未登録）
SELECT
  e.id,
  'entry' AS item_type,
  c.date AS item_date,
  c.title || ' - ' || s.name_jp AS title,
  c.place AS location,
  e.note,
  jsonb_build_object(
    'entry', row_to_json(e.*),
    'competition', row_to_json(c.*),
    'style', row_to_json(s.*),
    'user_id', e.user_id,
    'entry_time', e.entry_time
  ) AS metadata
FROM entries e
JOIN competitions c ON c.id = e.competition_id
JOIN styles s ON s.id = e.style_id
WHERE e.user_id = auth.uid()
  AND e.team_id IS NULL
  -- 記録が存在しない
  AND NOT EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = e.competition_id
      AND r.user_id = e.user_id
      AND r.style_id = e.style_id
  )

UNION ALL

-- チームエントリー（記録未登録）
SELECT
  e.id,
  'entry' AS item_type,
  c.date AS item_date,
  c.title || ' - ' || s.name_jp AS title,
  c.place AS location,
  e.note,
  jsonb_build_object(
    'entry', row_to_json(e.*),
    'competition', row_to_json(c.*),
    'style', row_to_json(s.*),
    'user_id', e.user_id,
    'team_id', e.team_id,
    'entry_time', e.entry_time
  ) AS metadata
FROM entries e
JOIN competitions c ON c.id = e.competition_id
JOIN styles s ON s.id = e.style_id
WHERE e.team_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = e.team_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  )
  -- 記録が存在しない
  AND NOT EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = e.competition_id
      AND r.user_id = e.user_id
      AND r.style_id = e.style_id
  )

UNION ALL

-- 大会記録（個人・チーム共通）
SELECT
  r.id,
  'record' AS item_type,
  c.date AS item_date,
  c.title || ' - ' || s.name_jp AS title,
  c.place AS location,
  r.note,
  jsonb_build_object(
    'record', row_to_json(r.*),
    'competition', row_to_json(c.*),
    'style', row_to_json(s.*),
    'user_id', r.user_id,
    'time', r.time,
    'is_relaying', r.is_relaying,
    'pool_type', c.pool_type
  ) AS metadata
FROM records r
JOIN competitions c ON c.id = r.competition_id
JOIN styles s ON s.id = r.style_id
WHERE r.user_id = auth.uid();

-- RLSを有効化
ALTER VIEW calendar_view SET (security_invoker = true);

-- コメント追加
COMMENT ON VIEW calendar_view IS 'カレンダー表示用の統合ビュー（練習、大会、エントリー、記録を含む）';

-- =============================================================================
-- マイグレーション完了
-- =============================================================================

