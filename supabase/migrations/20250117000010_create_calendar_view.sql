-- カレンダービューの作成
-- 練習、大会、記録を統合したビュー（認証済みユーザーのみ）

CREATE OR REPLACE VIEW calendar_view AS
-- 練習記録（認証済みユーザーのみ）
SELECT 
  p.id,
  'practice'::text as item_type,
  p.date as item_date,
  CONCAT('練習 - ', COALESCE(p.place, '場所未設定')) as title,
  p.place,
  p.note,
  NULL::jsonb as metadata,
  p.created_at,
  p.updated_at
FROM practices p
WHERE p.user_id = auth.uid()

UNION ALL

-- 大会記録（認証済みユーザーのみ）
SELECT 
  r.id,
  'record'::text as item_type,
  c.date as item_date,
  CONCAT(s.name_jp, CASE WHEN r.is_relaying THEN 'R' ELSE '' END) as title,
  c.place,
  r.note,
  jsonb_build_object(
    'time', r.time,
    'is_relaying', r.is_relaying,
    'video_url', r.video_url,
    'style', jsonb_build_object(
      'id', s.id::text,
      'name_jp', s.name_jp,
      'distance', s.distance
    ),
    'competition_id', c.id
  ) as metadata,
  r.created_at,
  r.updated_at
FROM records r
JOIN competitions c ON r.competition_id = c.id
JOIN styles s ON r.style_id = s.id
WHERE r.user_id = auth.uid()

UNION ALL

-- 大会（記録がない場合、認証済みユーザーのみ）
SELECT 
  c.id,
  'competition'::text as item_type,
  c.date as item_date,
  CONCAT('大会 - ', c.title) as title,
  c.place,
  c.note,
  jsonb_build_object(
    'title', c.title,
    'place', c.place,
    'pool_type', c.pool_type
  ) as metadata,
  c.created_at,
  c.updated_at
FROM competitions c
WHERE c.user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM records r WHERE r.competition_id = c.id
  );

-- RLSポリシーを設定
ALTER VIEW calendar_view OWNER TO postgres;

-- 注意: ビューには直接インデックスを作成できません
-- パフォーマンス向上のため、基になるテーブルにインデックスを作成
CREATE INDEX IF NOT EXISTS idx_practices_date ON practices(date);
CREATE INDEX IF NOT EXISTS idx_practices_user_id ON practices(user_id);

CREATE INDEX IF NOT EXISTS idx_competitions_date ON competitions(date);
CREATE INDEX IF NOT EXISTS idx_competitions_user_id ON competitions(user_id);

CREATE INDEX IF NOT EXISTS idx_records_competition_id ON records(competition_id);
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
