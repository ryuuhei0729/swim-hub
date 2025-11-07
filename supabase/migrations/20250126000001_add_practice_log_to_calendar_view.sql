-- =============================================================================
-- カレンダービューにpractice_logを追加
-- practice_logをカレンダーに表示できるようにする
-- 作成日: 2025年1月26日
-- =============================================================================

-- 既存のカレンダービューを削除
DROP VIEW IF EXISTS calendar_view;

-- カレンダービューを再作成（practice_logを含む）
CREATE OR REPLACE VIEW calendar_view AS
-- 個人練習（practice_logが存在しない場合のみ）
SELECT
  p.id,
  'practice' AS item_type,
  p.date AS item_date,
  '練習' AS title,
  p.place,
  p.note,
  jsonb_build_object(
    'practice', to_jsonb(p),
    'user_id', p.user_id
  ) AS metadata
FROM practices p
WHERE p.user_id = auth.uid() 
  AND p.team_id IS NULL
  -- practice_logが存在しない場合のみ
  AND NOT EXISTS (
    SELECT 1 FROM practice_logs pl WHERE pl.practice_id = p.id
  )

UNION ALL

-- チーム練習（practice_logが存在しない場合のみ）
SELECT
  p.id,
  'team_practice' AS item_type,
  p.date AS item_date,
  'チーム練習' AS title,
  p.place,
  p.note,
  jsonb_build_object(
    'practice', to_jsonb(p),
    'user_id', p.user_id,
    'team_id', p.team_id,
    'team', to_jsonb(t)
  ) AS metadata
FROM practices p
JOIN teams t ON t.id = p.team_id
WHERE p.team_id IS NOT NULL
  -- practice_logが存在しない場合のみ
  AND NOT EXISTS (
    SELECT 1 FROM practice_logs pl WHERE pl.practice_id = p.id
  )
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = p.team_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  )

UNION ALL

-- 個人練習ログ
SELECT
  pl.id,
  'practice_log' AS item_type,
  p.date AS item_date,
  CASE 
    WHEN pl.set_count = 1 THEN (pl.distance::text || 'm × ' || pl.rep_count::text || '本')
    ELSE (pl.distance::text || 'm × ' || pl.rep_count::text || '本 × ' || pl.set_count::text || 'セット')
  END AS title,
  p.place,
  pl.note,
  jsonb_build_object(
    'practice_log', to_jsonb(pl),
    'practice', to_jsonb(p),
    'user_id', pl.user_id
  ) AS metadata
FROM practice_logs pl
JOIN practices p ON p.id = pl.practice_id
WHERE pl.user_id = auth.uid() AND p.team_id IS NULL

UNION ALL

-- チーム練習ログ
SELECT
  pl.id,
  'practice_log' AS item_type,
  p.date AS item_date,
  CASE 
    WHEN pl.set_count = 1 THEN (pl.distance::text || 'm × ' || pl.rep_count::text || '本')
    ELSE (pl.distance::text || 'm × ' || pl.rep_count::text || '本 × ' || pl.set_count::text || 'セット')
  END AS title,
  p.place,
  pl.note,
  jsonb_build_object(
    'practice_log', to_jsonb(pl),
    'practice', to_jsonb(p),
    'user_id', pl.user_id,
    'team_id', p.team_id,
    'team', to_jsonb(t)
  ) AS metadata
FROM practice_logs pl
JOIN practices p ON p.id = pl.practice_id
JOIN teams t ON t.id = p.team_id
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
  c.place,
  c.note,
  jsonb_build_object(
    'competition', to_jsonb(c),
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
  c.place,
  c.note,
  jsonb_build_object(
    'competition', to_jsonb(c),
    'user_id', c.user_id,
    'team_id', c.team_id,
    'team', to_jsonb(t),
    'pool_type', c.pool_type
  ) AS metadata
FROM competitions c
JOIN teams t ON t.id = c.team_id
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

-- 個人エントリー（記録未登録）- Competition単位で集約
SELECT
  c.id,
  'entry' AS item_type,
  c.date AS item_date,
  c.title AS title,
  c.place,
  NULL AS note,
  jsonb_build_object(
    'competition', to_jsonb(c),
    'user_id', c.user_id
  ) AS metadata
FROM competitions c
WHERE c.user_id = auth.uid()
  AND c.team_id IS NULL
  -- 記録は存在しない、エントリーが存在する
  AND NOT EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = c.id AND r.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM entries e
    WHERE e.competition_id = c.id AND e.user_id = auth.uid() AND e.team_id IS NULL
  )

UNION ALL

-- チームエントリー（記録未登録）- Competition単位で集約
SELECT
  c.id,
  'entry' AS item_type,
  c.date AS item_date,
  c.title AS title,
  c.place,
  NULL AS note,
  jsonb_build_object(
    'competition', to_jsonb(c),
    'user_id', c.user_id,
    'team_id', c.team_id,
    'team', to_jsonb(t)
  ) AS metadata
FROM competitions c
JOIN teams t ON t.id = c.team_id
WHERE c.team_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = c.team_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  )
  -- 記録は存在しない、エントリーが存在する
  AND NOT EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = c.id AND r.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM entries e
    WHERE e.competition_id = c.id AND e.user_id = auth.uid() AND e.team_id IS NOT NULL
  )

UNION ALL

-- 大会記録（個人）- Competition単位で集約
SELECT
  c.id,
  'record' AS item_type,
  c.date AS item_date,
  c.title AS title,
  c.place,
  NULL AS note,
  jsonb_build_object(
    'competition', to_jsonb(c),
    'user_id', c.user_id,
    'pool_type', c.pool_type
  ) AS metadata
FROM competitions c
WHERE c.user_id = auth.uid()
  AND c.team_id IS NULL
  -- 記録が存在する
  AND EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = c.id AND r.user_id = auth.uid()
  )

UNION ALL

-- 大会記録（チーム）- Competition単位で集約
SELECT
  c.id,
  'record' AS item_type,
  c.date AS item_date,
  c.title AS title,
  c.place,
  NULL AS note,
  jsonb_build_object(
    'competition', to_jsonb(c),
    'user_id', c.user_id,
    'team_id', c.team_id,
    'team', to_jsonb(t),
    'pool_type', c.pool_type
  ) AS metadata
FROM competitions c
JOIN teams t ON t.id = c.team_id
WHERE c.team_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = c.team_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  )
  -- 記録が存在する
  AND EXISTS (
    SELECT 1 FROM records r
    WHERE r.competition_id = c.id AND r.user_id = auth.uid()
  );

-- RLSを有効化
ALTER VIEW calendar_view SET (security_invoker = true);

-- コメント追加
COMMENT ON VIEW calendar_view IS 'カレンダー表示用の統合ビュー（練習、練習ログ、大会、エントリー、記録を含む）';

-- =============================================================================
-- マイグレーション完了
-- =============================================================================
