-- カレンダービューのセキュリティ強化
-- security_invokerを有効にして、RLSが正しく適用されるようにする

-- 既存のViewを削除
DROP VIEW IF EXISTS public.calendar_view;

-- security_invokerを有効にしたViewを再作成
CREATE VIEW public.calendar_view 
WITH (security_invoker = true) AS
-- 個人練習（認証済みユーザーのみ）
SELECT 
  p.id,
  'practice'::text as item_type,
  p.date as item_date,
  CONCAT('練習 - ', COALESCE(p.place, '場所未設定')) as title,
  p.place as location,
  p.note,
  jsonb_build_object(
    'user_id', p.user_id,
    'team_id', p.team_id,
    'is_team', p.team_id IS NOT NULL
  ) as metadata,
  p.created_at,
  p.updated_at
FROM public.practices p
WHERE p.user_id = auth.uid() AND p.team_id IS NULL

UNION ALL

-- チーム練習（認証済みユーザーのみ）
SELECT 
  p.id,
  'team_practice'::text as item_type,
  p.date as item_date,
  CONCAT('チーム練習 - ', COALESCE(p.place, '場所未設定')) as title,
  p.place as location,
  p.note,
  jsonb_build_object(
    'user_id', p.user_id,
    'team_id', p.team_id,
    'is_team', true
  ) as metadata,
  p.created_at,
  p.updated_at
FROM public.practices p
WHERE p.user_id = auth.uid() AND p.team_id IS NOT NULL

UNION ALL

-- 大会記録（認証済みユーザーのみ）
SELECT 
  r.id,
  'record'::text as item_type,
  c.date as item_date,
  CONCAT(s.name_jp, CASE WHEN r.is_relaying THEN 'R' ELSE '' END) as title,
  c.place as location,
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
    'competition_id', c.id,
    'user_id', r.user_id,
    'team_id', c.team_id,
    'is_team', c.team_id IS NOT NULL
  ) as metadata,
  r.created_at,
  r.updated_at
FROM public.records r
JOIN public.competitions c ON r.competition_id = c.id
JOIN public.styles s ON r.style_id = s.id
WHERE r.user_id = auth.uid()

UNION ALL

-- 個人大会（記録がない場合、認証済みユーザーのみ）
SELECT 
  c.id,
  'competition'::text as item_type,
  c.date as item_date,
  CONCAT('大会 - ', c.title) as title,
  c.place as location,
  c.note,
  jsonb_build_object(
    'title', c.title,
    'place', c.place,
    'pool_type', c.pool_type,
    'user_id', c.user_id,
    'team_id', c.team_id,
    'is_team', c.team_id IS NOT NULL
  ) as metadata,
  c.created_at,
  c.updated_at
FROM public.competitions c
WHERE c.user_id = auth.uid() AND c.team_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.records r WHERE r.competition_id = c.id
  )

UNION ALL

-- チーム大会（記録がない場合、認証済みユーザーのみ）
SELECT 
  c.id,
  'team_competition'::text as item_type,
  c.date as item_date,
  CONCAT('チーム大会 - ', c.title) as title,
  c.place as location,
  c.note,
  jsonb_build_object(
    'title', c.title,
    'place', c.place,
    'pool_type', c.pool_type,
    'user_id', c.user_id,
    'team_id', c.team_id,
    'is_team', true
  ) as metadata,
  c.created_at,
  c.updated_at
FROM public.competitions c
WHERE c.user_id = auth.uid() AND c.team_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.records r WHERE r.competition_id = c.id
  );

-- security_invokerが有効なので、Viewは呼び出し側の権限で実行される
-- 所有者はpostgresのままだが、RLSは正しく適用される

-- 明示的に必要最小限の権限を付与
-- authenticatedロールにSELECT権限のみを付与
GRANT SELECT ON public.calendar_view TO authenticated;

-- anonロールには権限を付与しない（認証済みユーザーのみ）
REVOKE ALL ON public.calendar_view FROM anon;

-- コメントを追加
COMMENT ON VIEW public.calendar_view IS 'Calendar view with security_invoker enabled to enforce RLS policies. Shows practices, competitions, and records for authenticated users only.';

