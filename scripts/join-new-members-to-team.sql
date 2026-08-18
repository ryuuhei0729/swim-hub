-- 新規3名 (takaharu / shuya / takumi) を招待コード 'DCCFEEB0' のチームに所属させる
-- 実行方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行
--
-- 前提:
--   1. scripts/register-users.sql を実行済み (3名が auth.users に存在する)
--   2. public.users にも行がある (handle_new_user トリガーが作る。
--      team_memberships.user_id は public.users(id) への FK なので必須)
--
-- 冪等: team_memberships (team_id, user_id) の UNIQUE 制約 + ON CONFLICT DO UPDATE により、
--       何度実行しても3名が status='approved' / is_active=true に収束する。
--       既存行が pending / rejected / 退部済み (is_active=false) でも承認済みへ揃える点に注意。
--
-- 注意: SQL Editor 実行 (= RLS バイパス) 前提で status='approved' / is_active=true を直接入れる。
--       アプリの request_join_team() 経由の「招待コードで参加申請 → 管理者が承認」フローを
--       管理者承認済みの状態までまとめて済ませることに相当する。

WITH team_ctx AS (
  SELECT id AS team_id
  FROM public.teams
  WHERE invite_code = 'DCCFEEB0'
),
target_users AS (
  SELECT id AS user_id
  FROM auth.users
  WHERE email IN (
    'takaharu@koishikawa.com',
    'shuya@koishikawa.com',
    'takumi@koishikawa.com'
  )
)
INSERT INTO public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at)
SELECT t.team_id, u.user_id, 'user', 'approved', true, CURRENT_DATE, NULL
FROM team_ctx t
CROSS JOIN target_users u
-- DO NOTHING だと、アプリで招待コードを入れて承認待ち (status='pending') になっている人や
-- 過去に退部した人 (is_active=false) の行が残っているとき、そのまま放置され
-- 「管理者承認済みの状態にする」という本スクリプトの目的を果たせない。
-- 承認状態のみ上書きする。role は既存の admin を 'user' に降格させないため触らない。
-- joined_at も初回参加日を保つため据え置く (再入部時は left_at を NULL に戻すだけ)。
ON CONFLICT (team_id, user_id) DO UPDATE
SET status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    left_at = EXCLUDED.left_at,
    updated_at = now();

-- 確認: 3行返り、team_name と status='approved' / is_active=true が埋まっていれば成功。
-- user_exists が false なら register-users.sql が未実行、team_name が NULL なら招待コード不一致。
SELECT
  e.email,
  (au.id IS NOT NULL) AS user_exists,
  t.name AS team_name,
  tm.role,
  tm.status,
  tm.is_active,
  tm.joined_at
FROM (VALUES
  ('takaharu@koishikawa.com'),
  ('shuya@koishikawa.com'),
  ('takumi@koishikawa.com')
) AS e(email)
LEFT JOIN auth.users au ON au.email = e.email
LEFT JOIN public.teams t ON t.invite_code = 'DCCFEEB0'
LEFT JOIN public.team_memberships tm ON tm.team_id = t.id AND tm.user_id = au.id
ORDER BY e.email;
